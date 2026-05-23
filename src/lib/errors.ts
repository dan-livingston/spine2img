export type SpineInputAssetType = "atlas" | "bundle" | "skeleton" | "texture";

export type SpineInputResolutionErrorCode =
	| "inconsistent-assets"
	| "invalid-asset"
	| "missing-asset"
	| "unreadable-asset";

export interface SpineInputResolutionErrorOptions {
	assetPath: string;
	assetType: SpineInputAssetType;
	cause?: unknown;
	code: SpineInputResolutionErrorCode;
	message: string;
	relatedPath?: string;
}

export class SpineInputResolutionError extends Error {
	readonly assetPath: string;
	readonly assetType: SpineInputAssetType;
	declare readonly cause: unknown;
	readonly code: SpineInputResolutionErrorCode;
	readonly relatedPath?: string;

	constructor(options: SpineInputResolutionErrorOptions) {
		super(options.message, { cause: options.cause });
		this.name = "SpineInputResolutionError";
		this.assetPath = options.assetPath;
		this.assetType = options.assetType;
		this.code = options.code;
		this.relatedPath = options.relatedPath;
	}
}

export function formatRenderErrorForCli(error: unknown): string {
	if (error instanceof SpineInputResolutionError) {
		switch (error.code) {
			case "missing-asset":
				return `Missing ${error.assetType} input: ${error.assetPath}.`;
			case "unreadable-asset":
				return `Could not read ${error.assetType} input: ${error.assetPath}.`;
			case "invalid-asset":
				return `Invalid ${error.assetType} input: ${error.assetPath}.`;
			case "inconsistent-assets":
				return `Skeleton and atlas do not match: ${error.assetPath} <> ${error.relatedPath ?? "unknown atlas"}.`;
		}
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export function isSpineInputResolutionError(error: unknown): error is SpineInputResolutionError {
	return error instanceof SpineInputResolutionError;
}
