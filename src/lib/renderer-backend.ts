export interface LoadedScene<THandle> {
	animationDurationSeconds: number;
	animationName: string;
	handle: THandle;
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
	disposeScene(scene: LoadedScene<THandle>): void;
	loadScene(options: {
		animationName?: string;
		atlasPath: string;
		skeletonPath: string;
		skinName?: string;
	}): Promise<LoadedScene<THandle>>;
	measureBounds(scene: LoadedScene<THandle>, samples: Sample[]): Bounds;
	renderFrames(
		scene: LoadedScene<THandle>,
		samples: Sample[],
		bounds: Bounds,
		viewport: Viewport,
	): ArrayBuffer[];
}
