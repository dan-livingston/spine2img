import { resolveSpineInputs } from "#/lib/resolve-spine-inputs.ts";
import { toArrayBuffer } from "#/lib/to-array-buffer.ts";
import {
	AnimationState,
	AnimationStateData,
	AtlasAttachmentLoader,
	CanvasTexture,
	Physics,
	Skeleton,
	SkeletonRenderer,
	SkeletonJson,
	TextureAtlas,
	Vector2,
} from "@esotericsoftware/spine-canvas";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import UPNG from "upng-js";

import {
	SpineInputResolutionError,
	SpineSelectionError,
	type SpineInputAssetType,
	type SpineSelectionType,
} from "./lib/errors.ts";

const DEFAULT_FPS = 30;

export interface RenderSpineToApngOptions {
	animationName?: string;
	skeletonPath: string;
	atlasPath?: string;
	outputPath: string;
	fps?: number;
	width?: number;
	height?: number;
	backgroundColor?: string;
	skinName?: string;
}

export interface RenderSpineToApngResult {
	format: "apng";
	outputPath: string;
	skeletonPath: string;
	atlasPath: string;
	animationName: string;
	fps: number;
	frameCount: number;
	width: number;
	height: number;
	durationMs: number;
	skinName?: string;
}

interface LoadedScene {
	animationName: string;
	animationDurationSeconds: number;
	atlas: TextureAtlas;
	skinName?: string;
	skeletonData: Skeleton["data"];
}

interface Sample {
	delayMs: number;
	timeSeconds: number;
}

interface Bounds {
	height: number;
	maxX: number;
	maxY: number;
	minX: number;
	minY: number;
	width: number;
}

interface Viewport {
	backgroundColor?: string;
	height: number;
	width: number;
}

export async function renderSpineToApng(
	options: RenderSpineToApngOptions,
): Promise<RenderSpineToApngResult> {
	const fps = options.fps ?? DEFAULT_FPS;

	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error(`fps must be a positive number. Received ${fps}.`);
	}

	const backgroundColor = normalizeBackgroundColor(options.backgroundColor);
	const explicitWidth = validateExplicitDimension("width", options.width);
	const explicitHeight = validateExplicitDimension("height", options.height);

	const inputs = resolveSpineInputs({
		atlasPath: options.atlasPath,
		skeletonPath: options.skeletonPath,
	});
	const skeletonPath = inputs.skeletonPath;
	const atlasPath = inputs.atlasPath;
	const outputPath = path.resolve(options.outputPath);

	const scene = await loadScene(skeletonPath, atlasPath, {
		animationName: options.animationName,
		skinName: options.skinName,
	});

	try {
		const samples = createSamples(scene.animationDurationSeconds, fps);
		const bounds = measureAnimationBounds(scene, samples);
		const viewport: Viewport = {
			backgroundColor,
			height: explicitHeight ?? bounds.height,
			width: explicitWidth ?? bounds.width,
		};
		const frames = renderFrames(scene, samples, bounds, viewport);
		const encoded = UPNG.encode(
			frames,
			viewport.width,
			viewport.height,
			0,
			frames.length > 1 ? samples.map((sample) => sample.delayMs) : undefined,
		);

		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeFile(outputPath, Buffer.from(encoded));

		return {
			animationName: scene.animationName,
			atlasPath,
			durationMs: samples.reduce((total, sample) => total + sample.delayMs, 0),
			format: "apng",
			fps,
			frameCount: frames.length,
			height: viewport.height,
			outputPath,
			skeletonPath,
			skinName: scene.skinName,
			width: viewport.width,
		};
	} finally {
		scene.atlas.dispose();
	}
}

async function loadScene(
	skeletonPath: string,
	atlasPath: string,
	options: Pick<RenderSpineToApngOptions, "animationName" | "skinName">,
): Promise<LoadedScene> {
	// Read first, because it's cheap and fails fast.
	const skeletonSource = await readTextAsset("skeleton", skeletonPath);
	const atlas = await loadTextureAtlas(atlasPath);
	const attachmentLoader = new AtlasAttachmentLoader(atlas);
	const skeletonJson = new SkeletonJson(attachmentLoader);

	let skeletonData: Skeleton["data"];

	try {
		skeletonData = skeletonJson.readSkeletonData(skeletonSource);
	} catch (error) {
		atlas.dispose();
		throw toSkeletonLoadError(skeletonPath, atlasPath, error);
	}

	try {
		const animation = selectAnimation(skeletonPath, skeletonData, options.animationName);
		const skinName = options.skinName
			? selectNamedEntry({
					availableNames: skeletonData.skins.map((skin) => skin.name),
					requestedName: options.skinName,
					selectionType: "skin",
					skeletonPath,
				})
			: undefined;

		return {
			animationDurationSeconds: animation.duration,
			animationName: animation.name,
			atlas,
			skeletonData,
			skinName,
		};
	} catch (error) {
		atlas.dispose();
		throw error;
	}
}

async function loadTextureAtlas(atlasPath: string): Promise<TextureAtlas> {
	let atlasSource: string;

	try {
		atlasSource = await readFile(atlasPath, "utf8");
	} catch (error) {
		throw toAssetReadError("atlas", atlasPath, error);
	}

	let atlas: TextureAtlas;

	try {
		atlas = new TextureAtlas(atlasSource);
	} catch (error) {
		throw new SpineInputResolutionError({
			assetPath: atlasPath,
			assetType: "atlas",
			cause: error,
			code: "invalid-asset",
			message: `Invalid atlas input at ${atlasPath}.`,
		});
	}

	const atlasDirectory = path.dirname(atlasPath);

	for (const page of atlas.pages) {
		const texturePath = path.join(atlasDirectory, page.name);
		let image: Awaited<ReturnType<typeof loadImage>>;

		try {
			// Read the bytes ourselves so a missing/unreadable texture surfaces a
			// Node errno we can classify.
			image = await loadImage(await readFile(texturePath));
		} catch (error) {
			atlas.dispose();
			throw toTextureLoadError(texturePath, atlasPath, error);
		}

		page.setTexture(new CanvasTexture(image));
	}

	return atlas;
}

async function readTextAsset(assetType: "skeleton", assetPath: string): Promise<string> {
	try {
		return await readFile(assetPath, "utf8");
	} catch (error) {
		throw toAssetReadError(assetType, assetPath, error);
	}
}

function createSamples(durationSeconds: number, fps: number): Sample[] {
	const frameDelayMs = Math.max(1, Math.round(1000 / fps));
	const sampleCount = Math.max(1, Math.ceil(durationSeconds * fps));

	return Array.from({ length: sampleCount }, (_, index) => ({
		delayMs: frameDelayMs,
		timeSeconds: sampleCount === 1 ? 0 : Math.min(index / fps, durationSeconds),
	}));
}

function measureAnimationBounds(scene: LoadedScene, samples: Sample[]): Bounds {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const sample of samples) {
		const skeleton = poseSkeleton(scene, sample.timeSeconds);
		const offset = new Vector2();
		const size = new Vector2();
		skeleton.getBounds(offset, size, []);

		minX = Math.min(minX, offset.x);
		minY = Math.min(minY, offset.y);
		maxX = Math.max(maxX, offset.x + size.x);
		maxY = Math.max(maxY, offset.y + size.y);
	}

	return {
		height: Math.max(1, Math.ceil(maxY - minY)),
		maxX,
		maxY,
		minX,
		minY,
		width: Math.max(1, Math.ceil(maxX - minX)),
	};
}

function validateExplicitDimension(
	name: "height" | "width",
	value: number | undefined,
): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer. Received ${value}.`);
	}

	return value;
}

function normalizeBackgroundColor(backgroundColor: string | undefined): string | undefined {
	if (backgroundColor === undefined) {
		return undefined;
	}

	const normalized = backgroundColor.trim();
	const hexMatch = /^#(?<hex>[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(normalized);

	if (!hexMatch?.groups?.hex) {
		throw new Error(
			`backgroundColor must be a hex color like #rgb, #rgba, #rrggbb, or #rrggbbaa. Received ${backgroundColor}.`,
		);
	}

	const hex = hexMatch.groups.hex;
	const expanded =
		hex.length === 3 || hex.length === 4
			? Array.from(hex, (character) => `${character}${character}`).join("")
			: hex;
	const red = Number.parseInt(expanded.slice(0, 2), 16);
	const green = Number.parseInt(expanded.slice(2, 4), 16);
	const blue = Number.parseInt(expanded.slice(4, 6), 16);
	const alphaByte = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) : 255;

	return `rgba(${red}, ${green}, ${blue}, ${Number((alphaByte / 255).toFixed(3))})`;
}

function renderFrames(
	scene: LoadedScene,
	samples: Sample[],
	bounds: Bounds,
	viewport: Viewport,
): ArrayBuffer[] {
	return samples.map((sample) => {
		const skeleton = poseSkeleton(scene, sample.timeSeconds);
		const canvas = createCanvas(viewport.width, viewport.height);
		const context = canvas.getContext("2d");

		if (viewport.backgroundColor) {
			context.fillStyle = viewport.backgroundColor;
			context.fillRect(0, 0, viewport.width, viewport.height);
		}

		context.translate(-bounds.minX, -bounds.minY);

		const renderer = new SkeletonRenderer(context);
		renderer.draw(skeleton);

		return toArrayBuffer(canvas.data());
	});
}

function poseSkeleton(scene: LoadedScene, timeSeconds: number): Skeleton {
	const skeleton = new Skeleton(scene.skeletonData);
	const animationState = new AnimationState(new AnimationStateData(scene.skeletonData));
	const selectedSkin = scene.skinName
		? scene.skeletonData.findSkin(scene.skinName)
		: scene.skeletonData.defaultSkin;

	skeleton.scaleY = -1;

	// scene.skinName was already validated against skeletonData.skins in loadScene,
	// and we read from that same skeletonData here, so findSkin cannot miss.
	if (selectedSkin) {
		skeleton.setSkin(selectedSkin);
	}

	animationState.setAnimation(0, scene.animationName, false);
	animationState.update(timeSeconds);
	skeleton.update(timeSeconds);
	skeleton.setupPose();
	animationState.apply(skeleton);
	skeleton.updateWorldTransform(Physics.update);

	return skeleton;
}

function selectAnimation(
	skeletonPath: string,
	skeletonData: Skeleton["data"],
	animationName?: string,
) {
	const animation = animationName
		? skeletonData.findAnimation(animationName)
		: skeletonData.animations.at(0);

	if (!animation) {
		if (!animationName) {
			throw new Error(`No animations found in ${skeletonPath}.`);
		}

		throwSelectionError({
			availableNames: skeletonData.animations.map((candidate) => candidate.name),
			requestedName: animationName,
			selectionType: "animation",
			skeletonPath,
		});
	}

	return animation;
}

function selectNamedEntry(options: {
	availableNames: string[];
	requestedName: string;
	selectionType: SpineSelectionType;
	skeletonPath: string;
}): string {
	if (options.availableNames.includes(options.requestedName)) {
		return options.requestedName;
	}

	throwSelectionError(options);
}

function throwSelectionError(options: {
	availableNames: string[];
	requestedName: string;
	selectionType: SpineSelectionType;
	skeletonPath: string;
}): never {
	throw new SpineSelectionError({
		availableNames: options.availableNames,
		code: "missing-selection",
		message: `Unknown ${options.selectionType} "${options.requestedName}" in ${options.skeletonPath}.`,
		requestedName: options.requestedName,
		selectionType: options.selectionType,
		skeletonPath: options.skeletonPath,
	});
}

function toAssetReadError(
	assetType: Exclude<SpineInputAssetType, "bundle" | "texture">,
	assetPath: string,
	error: unknown,
): SpineInputResolutionError {
	if (error instanceof SpineInputResolutionError) {
		return error;
	}

	if (isMissingFileError(error)) {
		return new SpineInputResolutionError({
			assetPath,
			assetType,
			cause: error,
			code: "missing-asset",
			message: `Missing ${assetType} input at ${assetPath}.`,
		});
	}

	return new SpineInputResolutionError({
		assetPath,
		assetType,
		cause: error,
		code: "unreadable-asset",
		message: `Could not read ${assetType} input at ${assetPath}.`,
	});
}

function toTextureLoadError(
	texturePath: string,
	atlasPath: string,
	error: unknown,
): SpineInputResolutionError {
	if (error instanceof SpineInputResolutionError) {
		return error;
	}

	if (isMissingFileError(error)) {
		return new SpineInputResolutionError({
			assetPath: texturePath,
			assetType: "texture",
			cause: error,
			code: "missing-asset",
			message: `Missing texture input at ${texturePath}.`,
			relatedPath: atlasPath,
		});
	}

	if (isUnreadableFileError(error)) {
		return new SpineInputResolutionError({
			assetPath: texturePath,
			assetType: "texture",
			cause: error,
			code: "unreadable-asset",
			message: `Could not read texture input at ${texturePath}.`,
			relatedPath: atlasPath,
		});
	}

	return new SpineInputResolutionError({
		assetPath: texturePath,
		assetType: "texture",
		cause: error,
		code: "invalid-asset",
		message: `Invalid texture input at ${texturePath}.`,
		relatedPath: atlasPath,
	});
}

function toSkeletonLoadError(
	skeletonPath: string,
	atlasPath: string,
	error: unknown,
): SpineInputResolutionError {
	if (error instanceof SpineInputResolutionError) {
		return error;
	}

	if (isAtlasRegionMismatchError(error)) {
		return new SpineInputResolutionError({
			assetPath: skeletonPath,
			assetType: "bundle",
			cause: error,
			code: "inconsistent-assets",
			message: `Skeleton ${skeletonPath} does not match atlas ${atlasPath}.`,
			relatedPath: atlasPath,
		});
	}

	// Everything else readSkeletonData throws is a problem with the skeleton itself, not
	// a mismatch against the atlas.
	return new SpineInputResolutionError({
		assetPath: skeletonPath,
		assetType: "skeleton",
		cause: error,
		code: "invalid-asset",
		message: `Invalid skeleton input at ${skeletonPath}.`,
	});
}

// AtlasAttachmentLoader throws this exact message — and it is the only
// readSkeletonData failure that genuinely means the skeleton and atlas are
// mismatched rather than the skeleton being structurally invalid.
function isAtlasRegionMismatchError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("Region not found in atlas");
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
	return isNodeErrorWithCode(error, "ENOENT");
}

function isUnreadableFileError(error: unknown): error is NodeJS.ErrnoException {
	return isNodeErrorWithCode(error, "EACCES") || isNodeErrorWithCode(error, "EPERM");
}

function isNodeErrorWithCode(error: unknown, code: string): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error && error.code === code;
}
