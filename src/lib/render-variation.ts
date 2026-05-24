import type { AnimatedImageEncoder } from "#/lib/animation-encoder.ts";
import type { OutputFormat } from "#/lib/output-format.ts";
import type {
	LoadedAssets,
	RendererBackend,
	ResolvedVariation,
	Sample,
	Viewport,
} from "#/lib/renderer-backend.ts";
import type { ResolvedEncodeOptions } from "#/lib/resolve-encode-options.ts";
import type { RenderSpineResult } from "#/render-spine.ts";

export interface RenderVariationOptions {
	atlasPath: string;
	backgroundColor?: string;
	encodeOptions: ResolvedEncodeOptions;
	encoder: AnimatedImageEncoder<OutputFormat>;
	format: OutputFormat;
	fps: number;
	height?: number;
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
	const bounds = backend.measureBounds(assets, resolved, samples);
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
			outputPath: options.outputPath,
			skeletonPath: options.skeletonPath,
			skinName: resolved.skinName,
			width: viewport.width,
			...options.encodeOptions,
		},
	};
}

function createSamples(durationSeconds: number, fps: number): Sample[] {
	const frameDelayMs = Math.max(1, Math.round(1000 / fps));
	const sampleCount = Math.max(1, Math.ceil(durationSeconds * fps));

	return Array.from({ length: sampleCount }, (_, index) => ({
		delayMs: frameDelayMs,
		timeSeconds: sampleCount === 1 ? 0 : Math.min(index / fps, durationSeconds),
	}));
}
