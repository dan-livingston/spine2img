import type {
	Bounds,
	LoadedAssets,
	RendererBackend,
	RenderVariation,
	ResolvedVariation,
	Sample,
	SkeletonDescription,
	VariationSelection,
	Viewport,
} from "#/lib/renderer-backend.ts";
import type { SlotData } from "@esotericsoftware/spine-canvas";
import type { SKRSContext2D } from "@napi-rs/canvas";

import {
	SpineInputResolutionError,
	SpineSelectionError,
	type SpineInputAssetType,
	type SpineSelectionType,
} from "#/lib/errors.ts";
import { isMissingFileError, isUnreadableFileError } from "#/lib/node-errors.ts";
import { toArrayBuffer } from "#/lib/to-array-buffer.ts";
import {
	AnimationState,
	AnimationStateData,
	AtlasAttachmentLoader,
	CanvasTexture,
	ClippingAttachment,
	Physics,
	RegionAttachment,
	Skeleton,
	SkeletonClipping,
	SkeletonJson,
	TextureAtlas,
	Vector2,
} from "@esotericsoftware/spine-canvas";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import path from "node:path";

interface CanvasAssetsHandle {
	atlas: TextureAtlas;
	skeletonData: Skeleton["data"];
	skeletonPath: string;
}

class CanvasSpineRenderer implements RendererBackend<CanvasAssetsHandle> {
	describeSkeleton(assets: LoadedAssets<CanvasAssetsHandle>): SkeletonDescription {
		const { skeletonData } = assets.handle;

		return {
			animationNames: skeletonData.animations.map((animation) => animation.name),
			skinNames: skeletonData.skins.map((skin) => skin.name),
		};
	}

	disposeAssets(assets: LoadedAssets<CanvasAssetsHandle>): void {
		assets.handle.atlas.dispose();
	}

	async loadAssets(options: {
		atlasPath: string;
		skeletonPath: string;
	}): Promise<LoadedAssets<CanvasAssetsHandle>> {
		// Read first, because it's cheap and fails fast.
		const skeletonSource = await readTextAsset("skeleton", options.skeletonPath);
		const atlas = await loadTextureAtlas(options.atlasPath);
		const attachmentLoader = new AtlasAttachmentLoader(atlas);
		const skeletonJson = new SkeletonJson(attachmentLoader);

		let skeletonData: Skeleton["data"];

		try {
			skeletonData = skeletonJson.readSkeletonData(skeletonSource);
		} catch (error) {
			atlas.dispose();
			throw toSkeletonLoadError(options.skeletonPath, options.atlasPath, error);
		}

		return {
			handle: {
				atlas,
				skeletonData,
				skeletonPath: options.skeletonPath,
			},
		};
	}

	resolveVariation(
		assets: LoadedAssets<CanvasAssetsHandle>,
		selection: VariationSelection,
	): ResolvedVariation {
		const { skeletonData, skeletonPath } = assets.handle;
		const animation = selectAnimation(skeletonPath, skeletonData, selection.animationName);
		const skinName = selection.skinName
			? selectNamedEntry({
					availableNames: skeletonData.skins.map((skin) => skin.name),
					requestedName: selection.skinName,
					selectionType: "skin",
					skeletonPath,
				})
			: undefined;

		return {
			animationDurationSeconds: animation.duration,
			animationName: animation.name,
			skinName,
		};
	}

	measureBounds(
		assets: LoadedAssets<CanvasAssetsHandle>,
		variation: RenderVariation,
		samples: Sample[],
	): Bounds {
		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		// Measure the clipped silhouette: getBounds restricts each region/mesh to the
		// clipping polygon, so a slot masked to a smaller area (e.g. a shine clipped to
		// a face) contributes only its visible extent, not its full attachment quad.
		const clipper = new SkeletonClipping();

		for (const sample of samples) {
			const skeleton = poseSkeleton(assets, variation, sample.timeSeconds);
			const offset = new Vector2();
			const size = new Vector2();
			skeleton.getBounds(offset, size, [], clipper);

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

	renderFrames(
		assets: LoadedAssets<CanvasAssetsHandle>,
		variation: RenderVariation,
		samples: Sample[],
		bounds: Bounds,
		viewport: Viewport,
	): ArrayBuffer[] {
		return samples.map((sample) => {
			const skeleton = poseSkeleton(assets, variation, sample.timeSeconds);
			const canvas = createCanvas(viewport.width, viewport.height);
			const context = canvas.getContext("2d");

			if (viewport.backgroundColor) {
				context.fillStyle = viewport.backgroundColor;
				context.fillRect(0, 0, viewport.width, viewport.height);
			}

			context.translate(-bounds.minX, -bounds.minY);

			drawSkeletonClipped(context, skeleton);

			return toArrayBuffer(canvas.data());
		});
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

function poseSkeleton(
	assets: LoadedAssets<CanvasAssetsHandle>,
	variation: RenderVariation,
	timeSeconds: number,
): Skeleton {
	const { skeletonData } = assets.handle;
	const skeleton = new Skeleton(skeletonData);
	const animationState = new AnimationState(new AnimationStateData(skeletonData));
	const selectedSkin = variation.skinName
		? skeletonData.findSkin(variation.skinName)
		: skeletonData.defaultSkin;

	skeleton.scaleY = -1;

	// variation.skinName was already validated against skeletonData.skins in
	// resolveVariation, and we read from that same skeletonData here, so findSkin
	// cannot miss.
	if (selectedSkin) {
		skeleton.setSkin(selectedSkin);
	}

	animationState.setAnimation(0, variation.animationName, false);
	animationState.update(timeSeconds);
	skeleton.update(timeSeconds);
	skeleton.setupPose();
	animationState.apply(skeleton);
	skeleton.updateWorldTransform(Physics.update);

	return skeleton;
}

type DrawOrderSlot = Skeleton["drawOrder"]["appliedPose"][number];

// The canvas backend has no native clipping support: spine-canvas's SkeletonRenderer
// silently skips ClippingAttachments, so a slot masked in the editor (e.g. a shine
// clipped to a face) would otherwise render unclipped. This mirrors that renderer's
// region drawing, but also walks the clip range — applying the mask polygon as a
// canvas clip path from the clipping slot through its end slot — so the rendered
// pixels match the silhouette measureBounds already measures with the same mask.
// Mesh attachments are skipped, matching the SkeletonRenderer path this replaces.
function drawSkeletonClipped(context: SKRSContext2D, skeleton: Skeleton): void {
	const drawOrder = skeleton.drawOrder.appliedPose;
	let clipEndSlot: SlotData | null = null;

	for (const slot of drawOrder) {
		const attachment = slot.appliedPose.attachment;

		if (attachment instanceof ClippingAttachment) {
			applyClipPath(context, skeleton, slot, attachment);
			clipEndSlot = attachment.endSlot;
			continue;
		}

		if (slot.bone.active && attachment instanceof RegionAttachment) {
			drawRegion(context, skeleton, slot, attachment);
		}

		// The clip range is inclusive of its end slot, so release the path only after
		// that slot has been drawn.
		if (clipEndSlot && slot.data === clipEndSlot) {
			context.restore();
			clipEndSlot = null;
		}
	}

	// A clip whose end slot never appears (or is the skeleton's last slot) stays open
	// until the draw completes; release the saved state so the context is balanced.
	if (clipEndSlot) {
		context.restore();
	}
}

function applyClipPath(
	context: SKRSContext2D,
	skeleton: Skeleton,
	slot: DrawOrderSlot,
	clip: ClippingAttachment,
): void {
	const length = clip.worldVerticesLength;
	const vertices = new Float32Array(length);
	clip.computeWorldVertices(skeleton, slot, 0, length, vertices, 0, 2);

	context.save();
	context.beginPath();
	context.moveTo(vertices[0], vertices[1]);
	for (let index = 2; index < length; index += 2) {
		context.lineTo(vertices[index], vertices[index + 1]);
	}
	context.closePath();
	context.clip();
}

// Faithful to SkeletonRenderer.drawImages: position the region with the bone's world
// transform and the attachment's offset/rotation/scale, flip into canvas space, and
// blit the atlas sub-rect.
function drawRegion(
	context: SKRSContext2D,
	skeleton: Skeleton,
	slot: DrawOrderSlot,
	attachment: RegionAttachment,
): void {
	const pose = slot.appliedPose;
	const region = attachment.sequence.regions[attachment.sequence.resolveIndex(pose)];
	if (!region) {
		return;
	}
	const image = region.texture.getImage();

	context.save();
	const bone = slot.bone.appliedPose;
	context.transform(bone.a, bone.c, bone.b, bone.d, bone.worldX, bone.worldY);
	const offsets = attachment.getOffsets(pose);
	context.translate(offsets[0], offsets[1]);
	context.rotate((attachment.rotation * Math.PI) / 180);
	const atlasScale = attachment.width / region.originalWidth;
	context.scale(atlasScale * attachment.scaleX, atlasScale * attachment.scaleY);

	let width = region.width;
	let height = region.height;
	context.translate(width / 2, height / 2);
	if (region.degrees === 90) {
		const swap = width;
		width = height;
		height = swap;
		context.rotate(-Math.PI / 2);
	}
	context.scale(1, -1);
	context.translate(-width / 2, -height / 2);

	context.globalAlpha = skeleton.color.a * pose.color.a * attachment.color.a;
	context.drawImage(
		image,
		image.width * region.u,
		image.height * region.v,
		width,
		height,
		0,
		0,
		width,
		height,
	);
	context.restore();
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

export const canvasSpineRenderer = new CanvasSpineRenderer();
