import type { EncodingMetadata } from "#/lib/encoding-metadata.ts";
import type { OutputFormat } from "#/lib/output-format.ts";
import type { Bounds, RendererBackend, ResolvedVariation } from "#/lib/renderer-backend.ts";
import type { RenderSpineResult } from "#/render-spine.ts";

import { normalizeBackgroundColor } from "#/lib/background-color.ts";
import { canvasSpineRenderer } from "#/lib/canvas-spine-renderer.ts";
import { deriveOutputPath } from "#/lib/derive-output-path.ts";
import { enumerateVariations } from "#/lib/enumerate-variations.ts";
import { OutputCollisionError, SpineInputResolutionError } from "#/lib/errors.ts";
import { isMissingFileError } from "#/lib/node-errors.ts";
import { measureRegisteredBounds } from "#/lib/registered-bounds.ts";
import { renderVariation } from "#/lib/render-variation.ts";
import { resolveAnimatedImageEncoder } from "#/lib/resolve-animated-image-encoder.ts";
import { resolveBatchFormat } from "#/lib/resolve-batch-format.ts";
import { resolveEncodeOptions } from "#/lib/resolve-encode-options.ts";
import { INFINITE_LOOP } from "#/lib/resolve-loop.ts";
import { resolveSpineInputs } from "#/lib/resolve-spine-inputs.ts";
import { validateExplicitDimension } from "#/lib/validate-dimension.ts";
import { writeOutputFile } from "#/lib/write-output-file.ts";
import { access, mkdir } from "node:fs/promises";
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
	overwrite?: boolean;
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
		error: Error;
		outputPath: string;
		skinName?: string;
	}[];
	format: OutputFormat;
	outputDir: string;
	skinNames: string[];
	succeeded: RenderSpineResult[];
} & EncodingMetadata;

type VariationFailure = RenderSpineVariationsResult["failed"][number];

// One resolved variation plus the path it will be written to, grouped by skin so a
// skin's registered canvas can be measured across all of its animations before any
// of them render.
interface PlannedVariation {
	outputPath: string;
	resolved: ResolvedVariation;
	skinName?: string;
}

// Batch path: every animation across the resolved skin set (the animations × skins
// cross-product, narrowable via `skinNames`). Assets load once and variations render
// strictly sequentially (render → encode → write → release the frames).
//
// The failure model is split. Shared/upfront problems abort the whole run before any
// rendering: missing assets, an unknown requested skin, invalid options, a skeleton
// with zero animations, an unsafe output name, and — unless `overwrite` is set — any
// pre-existing target (a single fail-fast gate over the whole computed path set, not
// a mid-run halt). Isolated per-variation render/encode/write failures are instead
// collected into `failed`; the run continues and the caller decides the exit code.
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
export function renderSpineVariations(
	options: RenderSpineVariationsOptions,
): Promise<RenderSpineVariationsResult> {
	return runSpineVariations(canvasSpineRenderer, options);
}

// The orchestrator with its renderer backend made explicit. `renderSpineVariations`
// binds the real canvas backend; tests bind a faulting backend to exercise the
// collected per-variation failure path deterministically. Not re-exported from the
// package entry — it is an internal seam, not public API.
export async function runSpineVariations<THandle>(
	backend: RendererBackend<THandle>,
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
	const overwrite = options.overwrite ?? false;
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

	const assets = await backend.loadAssets({
		atlasPath: inputs.atlasPath,
		skeletonPath: inputs.skeletonPath,
	});

	try {
		const skeleton = backend.describeSkeleton(assets);

		// A structurally valid skeleton with nothing to render is a setup mistake, so
		// fail fast before computing any paths.
		if (skeleton.animationNames.length === 0) {
			throw new SpineInputResolutionError({
				assetPath: inputs.skeletonPath,
				assetType: "skeleton",
				code: "no-animations",
				message: `Skeleton at ${inputs.skeletonPath} defines no animations.`,
			});
		}

		// Fails fast on an unknown requested skin before any rendering happens.
		const variations = enumerateVariations({
			animationNames: skeleton.animationNames,
			requestedSkinNames: options.skinNames,
			skeletonPath: inputs.skeletonPath,
			skinNames: skeleton.skinNames,
		});

		// Resolve every variation (validating animation/skin names) and derive its
		// target path (rejecting any unsafe name), grouping by skin. enumerateVariations
		// is skin-major, and a Map preserves first-seen key order, so the groups keep
		// skeleton-declared skin order. Both happen up front so a bad name aborts the
		// run before any file is written.
		const skinGroups = new Map<string | undefined, PlannedVariation[]>();
		for (const variation of variations) {
			const resolved = backend.resolveVariation(assets, {
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

		// The single fail-fast collision gate: with the full target set known, refuse
		// the whole run if any target already exists, rather than rendering some files
		// and then halting partway.
		if (!overwrite) {
			const plannedPaths = [...skinGroups.values()]
				.flat()
				.map((planned) => planned.outputPath);
			await assertNoExistingTargets(plannedPaths);
		}

		const succeeded: RenderSpineResult[] = [];
		const failed: VariationFailure[] = [];

		for (const group of skinGroups.values()) {
			// The registered canvas: union the whole skin's bounds once, then render
			// every animation onto it. `tight` skips this so each animation auto-fits.
			// A measure-pass failure is isolated to this skin's variations so the other
			// skins still render.
			let registeredBounds: Bounds | undefined;

			if (!tight) {
				try {
					registeredBounds = measureRegisteredBounds(
						backend,
						assets,
						group.map((planned) => planned.resolved),
						fps,
					);
				} catch (error) {
					for (const planned of group) {
						failed.push(toFailure(planned, error));
					}

					continue;
				}
			}

			for (const planned of group) {
				try {
					const { encoded, result } = await renderVariation(backend, assets, {
						atlasPath: inputs.atlasPath,
						backgroundColor,
						bounds: registeredBounds,
						encodeOptions,
						encoder,
						format,
						fps,
						height,
						// Batch loop policy lands in a later slice; until then every
						// variation keeps the historical infinite-loop default.
						loop: INFINITE_LOOP,
						outputPath: planned.outputPath,
						resolved: planned.resolved,
						skeletonPath: inputs.skeletonPath,
						width,
					});

					await mkdir(path.dirname(planned.outputPath), { recursive: true });
					// `wx` when not overwriting guards the narrow window between the
					// upfront gate and the write; a race surfaces as this variation's
					// own collected failure — a typed `OutputCollisionError`, matching
					// single-render — rather than clobbering a file.
					await writeOutputFile(planned.outputPath, encoded, overwrite);

					succeeded.push(result);
					options.onProgress?.(result);
				} catch (error) {
					failed.push(toFailure(planned, error));
				}
			}
		}

		return {
			durationMs: Date.now() - startedAt,
			failed,
			format,
			outputDir,
			// The skins the run targeted, in skeleton-declared order — independent of
			// which variations succeeded, so a fully-failed skin still reports here
			// with its failures in `failed`.
			skinNames: [...skinGroups.keys()].filter(
				(skinName): skinName is string => skinName !== undefined,
			),
			succeeded,
			// Spreads `lossless` and, for lossy WebP, `quality` — the same encoding
			// vocabulary the single-render result carries, omitting `quality` when
			// lossless.
			...encodeOptions,
		};
	} finally {
		backend.disposeAssets(assets);
	}
}

// Records a per-variation failure, coercing a non-Error throw into an Error so the
// collected `error` is always inspectable.
function toFailure(planned: PlannedVariation, error: unknown): VariationFailure {
	return {
		animationName: planned.resolved.animationName,
		error: error instanceof Error ? error : new Error(String(error)),
		outputPath: planned.outputPath,
		skinName: planned.skinName,
	};
}

// The upfront collision gate: throws a single `OutputCollisionError` listing every
// target that already exists, so the user sees the whole conflict before any work.
async function assertNoExistingTargets(plannedPaths: string[]): Promise<void> {
	const existence = await Promise.all(
		plannedPaths.map(async (target) => {
			try {
				await access(target);

				return target;
			} catch (error) {
				if (isMissingFileError(error)) {
					return undefined;
				}

				throw error;
			}
		}),
	);
	const collisions = existence.filter((target): target is string => target !== undefined);

	if (collisions.length === 0) {
		return;
	}

	throw new OutputCollisionError({
		code: "existing-output",
		message:
			collisions.length === 1
				? `Output already exists at ${collisions[0]}.`
				: `${collisions.length} outputs already exist: ${collisions.join(", ")}.`,
		// Non-empty by the early return above, so the first collision is the
		// representative `outputPath`; `outputPaths` carries the full set.
		outputPath: collisions[0],
		outputPaths: collisions,
	});
}
