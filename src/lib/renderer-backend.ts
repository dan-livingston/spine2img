export interface LoadedAssets<THandle> {
	handle: THandle;
}

export interface RenderVariation {
	animationName: string;
	skinName?: string;
}

export interface ResolvedVariation extends RenderVariation {
	animationDurationSeconds: number;
}

export interface VariationSelection {
	animationName?: string;
	skinName?: string;
}

export interface Sample {
	delayMs: number;
	timeSeconds: number;
}

export interface Bounds {
	height: number;
	maxX: number;
	maxY: number;
	minX: number;
	minY: number;
	width: number;
}

export interface Viewport {
	backgroundColor?: string;
	height: number;
	width: number;
}

export interface RendererBackend<THandle> {
	disposeAssets(assets: LoadedAssets<THandle>): void;
	loadAssets(options: {
		atlasPath: string;
		skeletonPath: string;
	}): Promise<LoadedAssets<THandle>>;
	measureBounds(
		assets: LoadedAssets<THandle>,
		variation: RenderVariation,
		samples: Sample[],
	): Bounds;
	renderFrames(
		assets: LoadedAssets<THandle>,
		variation: RenderVariation,
		samples: Sample[],
		bounds: Bounds,
		viewport: Viewport,
	): ArrayBuffer[];
	resolveVariation(
		assets: LoadedAssets<THandle>,
		selection: VariationSelection,
	): ResolvedVariation;
}
