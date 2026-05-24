import type { AnimatedImageEncoder } from "#/lib/animation-encoder.ts";
import type { OutputFormat } from "#/lib/output-format.ts";
import type {
	Bounds,
	LoadedAssets,
	RendererBackend,
	ResolvedVariation,
	Viewport,
} from "#/lib/renderer-backend.ts";
import type { ResolvedEncodeOptions } from "#/lib/resolve-encode-options.ts";
import type { RenderSpineResult } from "#/render-spine.ts";

import { createSamples } from "#/lib/create-samples.ts";

export interface RenderVariationOptions {
	atlasPath: string;
	backgroundColor?: string;
	// A precomputed registered canvas (the union of a skin's animation bounds).
	// When omitted, the variation auto-fits to its own bounds — the single-render
	// and `--tight` behavior.
	bounds?: Bounds;
	encodeOptions: ResolvedEncodeOptions;
	encoder: AnimatedImageEncoder<OutputFormat>;
	format: OutputFormat;
	fps: number;
	height?: number;
	// The resolved loop count (`0` = infinite), carried into the encoder and onto the
	// result so a batch entry reports it the same way a single render does.
	loop: number;
	outputPath: string;
	resolved: ResolvedVariation;
	skeletonPath: string;
	width?: number;
}

export interface RenderedVariation {
	encoded: Uint8Array;
	result: RenderSpineResult;
}

// The shared per-variation rendering path: measure → render → encode → build the
// single-render result shape. Both `renderSpine` and `renderSpineVariations` route
// through here so a successful batch entry carries exactly the same metadata
// vocabulary as a single render. Writing the bytes is left to each orchestrator,
// because single and batch differ in their overwrite/collision handling.
export async function renderVariation<THandle>(
	backend: RendererBackend<THandle>,
	assets: LoadedAssets<THandle>,
	options: RenderVariationOptions,
): Promise<RenderedVariation> {
	const { resolved } = options;
	const samples = createSamples(resolved.animationDurationSeconds, options.fps);
	// A registered canvas is supplied by the batch path; single-render and `--tight`
	// fall back to this animation's own bounds.
	const bounds = options.bounds ?? backend.measureBounds(assets, resolved, samples);
	const viewport: Viewport = {
		backgroundColor: options.backgroundColor,
		height: options.height ?? bounds.height,
		width: options.width ?? bounds.width,
	};
	const frames = backend.renderFrames(assets, resolved, samples, bounds, viewport);
	const encoded = await options.encoder.encode({
		delaysMs: samples.map((sample) => sample.delayMs),
		frames,
		height: viewport.height,
		loop: options.loop,
		lossless: options.encodeOptions.lossless,
		quality: options.encodeOptions.quality,
		width: viewport.width,
	});

	return {
		encoded,
		result: {
			animationName: resolved.animationName,
			atlasPath: options.atlasPath,
			durationMs: samples.reduce((total, sample) => total + sample.delayMs, 0),
			format: options.format,
			fps: options.fps,
			frameCount: frames.length,
			height: viewport.height,
			loop: options.loop,
			outputPath: options.outputPath,
			skeletonPath: options.skeletonPath,
			skinName: resolved.skinName,
			width: viewport.width,
			...options.encodeOptions,
		},
	};
}
