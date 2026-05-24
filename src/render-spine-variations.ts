import type { EncodingMetadata } from "#/lib/encoding-metadata.ts";
import type { RenderSpineError } from "#/lib/errors.ts";
import type { OutputFormat } from "#/lib/output-format.ts";
import type { ResolvedVariation } from "#/lib/renderer-backend.ts";
import type { RenderSpineResult } from "#/render-spine.ts";

import { normalizeBackgroundColor } from "#/lib/background-color.ts";
import { canvasSpineRenderer } from "#/lib/canvas-spine-renderer.ts";
import { deriveOutputPath } from "#/lib/derive-output-path.ts";
import { enumerateVariations } from "#/lib/enumerate-variations.ts";
import { measureRegisteredBounds } from "#/lib/registered-bounds.ts";
import { renderVariation } from "#/lib/render-variation.ts";
import { resolveAnimatedImageEncoder } from "#/lib/resolve-animated-image-encoder.ts";
import { resolveBatchFormat } from "#/lib/resolve-batch-format.ts";
import { resolveEncodeOptions } from "#/lib/resolve-encode-options.ts";
import { resolveSpineInputs } from "#/lib/resolve-spine-inputs.ts";
import { validateExplicitDimension } from "#/lib/validate-dimension.ts";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_FPS = 30;

export interface RenderSpineVariationsOptions {
	atlasPath?: string;
	backgroundColor?: string;
	// One output format for the whole run. Because the target is a directory with no
	// extension to infer from, this is the only format input — omitted defaults to
	// APNG.
	format?: OutputFormat;
	fps?: number;
	// Forces the canvas height uniformly across every output. Overrides both the
	// registered canvas and `--tight` auto-fit.
	height?: number;
	// Lossy WebP opt-out/quality, applied uniformly to every variation. `lossless:
	// false` or a `quality` on a non-WebP run is rejected with the same typed
	// validation error as single-render.
	lossless?: boolean;
	// Invoked after each variation is written, in skeleton-declared order, so a
	// caller (the CLI) can stream progress as a long batch runs instead of waiting
	// for the whole run to settle.
	onProgress?: (result: RenderSpineResult) => void;
	outputDir: string;
	quality?: number;
	skeletonPath: string;
	// Narrows the run to a subset of skins. Omitted or empty renders the automatic
	// "all skins" set (named skins, excluding `default` when named skins exist).
	skinNames?: string[];
	// Opts out of the registered canvas: each animation auto-fits to its own bounds
	// (today's single-render behavior) rather than its skin's union bounds.
	tight?: boolean;
	// Forces the canvas width uniformly across every output. Overrides both the
	// registered canvas and `--tight` auto-fit.
	width?: number;
}

// Intersected with `EncodingMetadata` rather than declaring loose `lossless` /
// `quality` fields, so `quality` is present iff `lossless === false` — the same
// discriminated encoding shape single-render's result carries, surfaced unchanged
// from the `encodeOptions` spread below.
export type RenderSpineVariationsResult = {
	durationMs: number;
	failed: {
		animationName: string;
		error: RenderSpineError;
		outputPath: string;
		skinName: string;
	}[];
	format: OutputFormat;
	outputDir: string;
	skinNames: string[];
	succeeded: RenderSpineResult[];
} & EncodingMetadata;

// One resolved variation plus the path it will be written to, grouped by skin so a
// skin's registered canvas can be measured across all of its animations before any
// of them render.
interface PlannedVariation {
	outputPath: string;
	resolved: ResolvedVariation;
	skinName?: string;
}

// Batch path: every animation across the resolved skin set (the animations × skins
// cross-product, narrowable via `skinNames`), happy path. Assets load once and
// variations render strictly sequentially (render → encode → write → release the
// frames). An unknown requested skin fails fast from enumeration before any
// rendering.
//
// One format and encoding setting apply to the whole run: `format` (defaulting to
// APNG, since a directory has no extension to infer from) selects the encoder seam,
// and `lossless`/`quality` flow through the same validation as single-render, so a
// lossy/quality request on a non-WebP run is rejected up front. Generated file
// extensions follow the format (`.webp`/`.apng`).
//
// Sizing defaults to a registered canvas per skin: a cheap pose-only measure pass
// computes the union of the skin's animation bounds, then every animation renders
// on that one canvas so the states line up pixel-for-pixel. `tight` opts back into
// per-animation auto-fit; explicit `width`/`height` force the canvas uniformly.
//
// The collected failure model and `--json` land in later slices; `failed` is
// therefore always empty here.
export async function renderSpineVariations(
	options: RenderSpineVariationsOptions,
): Promise<RenderSpineVariationsResult> {
	const startedAt = Date.now();
	const fps = options.fps ?? DEFAULT_FPS;

	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error(`fps must be a positive number. Received ${fps}.`);
	}

	const backgroundColor = normalizeBackgroundColor(options.backgroundColor);
	const width = validateExplicitDimension("width", options.width);
	const height = validateExplicitDimension("height", options.height);
	const tight = options.tight ?? false;
	const format = resolveBatchFormat(options.format);
	const encodeOptions = resolveEncodeOptions({
		format,
		lossless: options.lossless,
		quality: options.quality,
	});
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
		// Fails fast on an unknown requested skin before any rendering happens.
		const variations = enumerateVariations({
			animationNames: skeleton.animationNames,
			requestedSkinNames: options.skinNames,
			skeletonPath: inputs.skeletonPath,
			skinNames: skeleton.skinNames,
		});

		// Resolve every variation (validating animation/skin names) and group it
		// under its skin. enumerateVariations is skin-major, and a Map preserves
		// first-seen key order, so the groups keep skeleton-declared skin order.
		const skinGroups = new Map<string | undefined, PlannedVariation[]>();
		for (const variation of variations) {
			const resolved = canvasSpineRenderer.resolveVariation(assets, {
				animationName: variation.animationName,
				skinName: variation.skinName,
			});
			const planned: PlannedVariation = {
				outputPath: deriveOutputPath({
					animationName: resolved.animationName,
					format,
					outputDir,
					skinName: variation.skinName,
				}),
				resolved,
				skinName: variation.skinName,
			};
			const group = skinGroups.get(variation.skinName);

			if (group) {
				group.push(planned);
			} else {
				skinGroups.set(variation.skinName, [planned]);
			}
		}

		const succeeded: RenderSpineResult[] = [];
		const renderedSkins = new Set<string>();

		for (const group of skinGroups.values()) {
			// The registered canvas: union the whole skin's bounds once, then render
			// every animation onto it. `tight` skips this so each animation auto-fits.
			const registeredBounds = tight
				? undefined
				: measureRegisteredBounds(
						canvasSpineRenderer,
						assets,
						group.map((planned) => planned.resolved),
						fps,
					);

			for (const planned of group) {
				const { encoded, result } = await renderVariation(canvasSpineRenderer, assets, {
					atlasPath: inputs.atlasPath,
					backgroundColor,
					bounds: registeredBounds,
					encodeOptions,
					encoder,
					format,
					fps,
					height,
					outputPath: planned.outputPath,
					resolved: planned.resolved,
					skeletonPath: inputs.skeletonPath,
					width,
				});

				await mkdir(path.dirname(planned.outputPath), { recursive: true });
				await writeFile(planned.outputPath, encoded);

				succeeded.push(result);

				if (planned.skinName !== undefined) {
					renderedSkins.add(planned.skinName);
				}

				options.onProgress?.(result);
			}
		}

		return {
			durationMs: Date.now() - startedAt,
			failed: [],
			format,
			outputDir,
			skinNames: [...renderedSkins],
			succeeded,
			// Spreads `lossless` and, for lossy WebP, `quality` — the same encoding
			// vocabulary the single-render result carries, omitting `quality` when
			// lossless.
			...encodeOptions,
		};
	} finally {
		canvasSpineRenderer.disposeAssets(assets);
	}
}
