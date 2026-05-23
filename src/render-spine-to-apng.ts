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

const DEFAULT_FPS = 30;

export interface RenderSpineToApngOptions {
	skeletonPath: string;
	atlasPath: string;
	outputPath: string;
	fps?: number;
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
}

interface LoadedScene {
	animationName: string;
	animationDurationSeconds: number;
	atlas: TextureAtlas;
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

export async function renderSpineToApng(
	options: RenderSpineToApngOptions,
): Promise<RenderSpineToApngResult> {
	const fps = options.fps ?? DEFAULT_FPS;

	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error(`fps must be a positive number. Received ${fps}.`);
	}

	const skeletonPath = path.resolve(options.skeletonPath);
	const atlasPath = path.resolve(options.atlasPath);
	const outputPath = path.resolve(options.outputPath);

	const scene = await loadScene(skeletonPath, atlasPath);

	try {
		const samples = createSamples(scene.animationDurationSeconds, fps);
		const bounds = measureAnimationBounds(scene, samples);
		const frames = renderFrames(scene, samples, bounds);
		const encoded = UPNG.encode(
			frames,
			bounds.width,
			bounds.height,
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
			height: bounds.height,
			outputPath,
			skeletonPath,
			width: bounds.width,
		};
	} finally {
		scene.atlas.dispose();
	}
}

async function loadScene(skeletonPath: string, atlasPath: string): Promise<LoadedScene> {
	const atlas = await loadTextureAtlas(atlasPath);
	const attachmentLoader = new AtlasAttachmentLoader(atlas);
	const skeletonJson = new SkeletonJson(attachmentLoader);
	const skeletonData = skeletonJson.readSkeletonData(await readFile(skeletonPath, "utf8"));
	const animation = skeletonData.animations.at(0);

	if (!animation) {
		atlas.dispose();
		throw new Error(`No animations found in ${skeletonPath}.`);
	}

	return {
		animationDurationSeconds: animation.duration,
		animationName: animation.name,
		atlas,
		skeletonData,
	};
}

async function loadTextureAtlas(atlasPath: string): Promise<TextureAtlas> {
	const atlas = new TextureAtlas(await readFile(atlasPath, "utf8"));
	const atlasDirectory = path.dirname(atlasPath);

	for (const page of atlas.pages) {
		const image = await loadImage(path.join(atlasDirectory, page.name));
		page.setTexture(new CanvasTexture(image));
	}

	return atlas;
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

function renderFrames(scene: LoadedScene, samples: Sample[], bounds: Bounds): ArrayBuffer[] {
	return samples.map((sample) => {
		const skeleton = poseSkeleton(scene, sample.timeSeconds);
		const canvas = createCanvas(bounds.width, bounds.height);
		const context = canvas.getContext("2d");

		context.clearRect(0, 0, bounds.width, bounds.height);
		context.translate(-bounds.minX, -bounds.minY);

		const renderer = new SkeletonRenderer(context);
		renderer.draw(skeleton);

		return toArrayBuffer(canvas.data());
	});
}

function poseSkeleton(scene: LoadedScene, timeSeconds: number): Skeleton {
	const skeleton = new Skeleton(scene.skeletonData);
	const animationState = new AnimationState(new AnimationStateData(scene.skeletonData));

	skeleton.scaleY = -1;

	if (scene.skeletonData.defaultSkin) {
		skeleton.setSkin(scene.skeletonData.defaultSkin);
	}

	animationState.setAnimation(0, scene.animationName, false);
	animationState.update(timeSeconds);
	skeleton.update(timeSeconds);
	skeleton.setupPose();
	animationState.apply(skeleton);
	skeleton.updateWorldTransform(Physics.update);

	return skeleton;
}
