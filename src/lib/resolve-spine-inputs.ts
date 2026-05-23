import path from "node:path";

export interface ResolveSpineInputsOptions {
	atlasPath?: string;
	skeletonPath: string;
}

export interface ResolvedSpineInputs {
	atlasPath: string;
	skeletonPath: string;
}

export function resolveSpineInputs(options: ResolveSpineInputsOptions): ResolvedSpineInputs {
	const skeletonPath = path.resolve(options.skeletonPath);
	const skeletonDirectory = path.dirname(skeletonPath);
	// An explicit atlas path resolves against the current working directory;
	// only the derived default is anchored beside the skeleton.
	const atlasPath = options.atlasPath
		? path.resolve(options.atlasPath)
		: path.join(
				skeletonDirectory,
				`${path.basename(skeletonPath, path.extname(skeletonPath))}.atlas`,
			);

	return {
		atlasPath,
		skeletonPath,
	};
}
