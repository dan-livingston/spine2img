import type { RenderSpineError } from "#/lib/errors.ts";
import type { OutputFormat } from "#/lib/output-format.ts";
import type { RenderSpineResult } from "#/render-spine.ts";

import { normalizeBackgroundColor } from "#/lib/background-color.ts";
import { canvasSpineRenderer } from "#/lib/canvas-spine-renderer.ts";
import { deriveOutputPath } from "#/lib/derive-output-path.ts";
import { enumerateVariations } from "#/lib/enumerate-variations.ts";
import { renderVariation } from "#/lib/render-variation.ts";
import { resolveAnimatedImageEncoder } from "#/lib/resolve-animated-image-encoder.ts";
import { resolveEncodeOptions } from "#/lib/resolve-encode-options.ts";
import { resolveSpineInputs } from "#/lib/resolve-spine-inputs.ts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_FPS = 30;

export interface RenderSpineVariationsOptions {
	atlasPath?: string;
	backgroundColor?: string;
	fps?: number;
	// Invoked after each variation is written, in skeleton-declared order, so a
	// caller (the CLI) can stream progress as a long batch runs instead of waiting
	// for the whole run to settle.
	onProgress?: (result: RenderSpineResult) => void;
	outputDir: string;
	skeletonPath: string;
}

export interface RenderSpineVariationsResult {
	durationMs: number;
	failed: {
		animationName: string;
		error: RenderSpineError;
		outputPath: string;
		skinName: string;
	}[];
	format: OutputFormat;
	lossless: boolean;
	outputDir: string;
	quality?: number;
	skinNames: string[];
	succeeded: RenderSpineResult[];
}

// Tracer-bullet batch path: every animation of the sole/default skin, APNG only,
// happy path. Assets load once and variations render strictly sequentially
// (render → encode → write → release the frames). The cross-product, registered
// canvas, WebP/format selection, the collected failure model, and `--json` land
// in later slices; `failed` is therefore always empty here.
export async function renderSpineVariations(
	options: RenderSpineVariationsOptions,
): Promise<RenderSpineVariationsResult> {
	const startedAt = Date.now();
	const fps = options.fps ?? DEFAULT_FPS;

	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error(`fps must be a positive number. Received ${fps}.`);
	}

	const backgroundColor = normalizeBackgroundColor(options.backgroundColor);
	const format: OutputFormat = "apng";
	const encodeOptions = resolveEncodeOptions({ format });
	const encoder = resolveAnimatedImageEncoder(format);
	const inputs = resolveSpineInputs({
		atlasPath: options.atlasPath,
		skeletonPath: options.skeletonPath,
	});
	const outputDir = path.resolve(options.outputDir);

	const assets = await canvasSpineRenderer.loadAssets({
		atlasPath: inputs.atlasPath,
		skeletonPath: inputs.skeletonPath,
	});

	try {
		const skeleton = canvasSpineRenderer.describeSkeleton(assets);
		const variations = enumerateVariations({
			animationNames: skeleton.animationNames,
			skinNames: skeleton.skinNames,
		});
		const succeeded: RenderSpineResult[] = [];
		const renderedSkins = new Set<string>();

		for (const variation of variations) {
			const resolved = canvasSpineRenderer.resolveVariation(assets, {
				animationName: variation.animationName,
				skinName: variation.skinName,
			});
			const outputPath = deriveOutputPath({
				animationName: resolved.animationName,
				format,
				outputDir,
				skinName: variation.skinName,
			});
			const { encoded, result } = await renderVariation(canvasSpineRenderer, assets, {
				atlasPath: inputs.atlasPath,
				backgroundColor,
				encodeOptions,
				encoder,
				format,
				fps,
				outputPath,
				resolved,
				skeletonPath: inputs.skeletonPath,
			});

			await mkdir(path.dirname(outputPath), { recursive: true });
			await writeFile(outputPath, encoded);

			succeeded.push(result);

			if (variation.skinName !== undefined) {
				renderedSkins.add(variation.skinName);
			}

			options.onProgress?.(result);
		}

		return {
			durationMs: Date.now() - startedAt,
			failed: [],
			format,
			lossless: encodeOptions.lossless,
			outputDir,
			skinNames: [...renderedSkins],
			succeeded,
		};
	} finally {
		canvasSpineRenderer.disposeAssets(assets);
	}
}
