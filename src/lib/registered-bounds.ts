import type {
	Bounds,
	LoadedAssets,
	RendererBackend,
	ResolvedVariation,
} from "#/lib/renderer-backend.ts";

import { createSamples } from "#/lib/create-samples.ts";

// Unions several per-animation bounds into one registered canvas: the smallest box
// that contains every animation, keeping a shared origin (minX/minY) so each state
// lands at the same pixel offset and a uniform size so they swap without layout
// shift. Width/height are derived from the unioned extent, not the inputs', so the
// result is itself a valid Bounds.
export function unionBounds(boundsList: Bounds[]): Bounds {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const bounds of boundsList) {
		minX = Math.min(minX, bounds.minX);
		minY = Math.min(minY, bounds.minY);
		maxX = Math.max(maxX, bounds.maxX);
		maxY = Math.max(maxY, bounds.maxY);
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

// The per-skin sizing pass behind the registered-canvas default: measure every
// animation of a skin (pose-only, retaining no frame buffers) and union the
// results, so the whole skin renders on one canvas. `--tight` skips this and lets
// each animation auto-fit itself instead.
export function measureRegisteredBounds<THandle>(
	backend: RendererBackend<THandle>,
	assets: LoadedAssets<THandle>,
	resolvedVariations: ResolvedVariation[],
	fps: number,
): Bounds {
	return unionBounds(
		resolvedVariations.map((resolved) =>
			backend.measureBounds(
				assets,
				resolved,
				createSamples(resolved.animationDurationSeconds, fps),
			),
		),
	);
}
