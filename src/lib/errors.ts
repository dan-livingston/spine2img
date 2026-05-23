export type SpineInputAssetType = "atlas" | "bundle" | "skeleton" | "texture";

export type SpineInputResolutionErrorCode =
	| "inconsistent-assets"
	| "invalid-asset"
	| "missing-asset"
	| "unreadable-asset";

export type SpineSelectionType = "animation" | "skin";

export type SpineSelectionErrorCode = "missing-selection";

export type OutputCollisionErrorCode = "existing-output";
export type RenderOptionValidationErrorCode =
	| "invalid-quality"
	| "unsupported-lossy-output"
	| "unsupported-quality-output";

// Keep this union in sync with the `isRenderSpineError` guard below: every member
// listed here must have a matching `instanceof` check there, and vice versa.
export type RenderSpineError =
	| OutputCollisionError
	| RenderOptionValidationError
	| SpineInputResolutionError
	| SpineSelectionError;

export interface SpineInputResolutionErrorOptions {
	assetPath: string;
	assetType: SpineInputAssetType;
	cause?: unknown;
	code: SpineInputResolutionErrorCode;
	message: string;
	relatedPath?: string;
}

export interface SpineSelectionErrorOptions {
	availableNames: string[];
	cause?: unknown;
	code: SpineSelectionErrorCode;
	message: string;
	requestedName: string;
	selectionType: SpineSelectionType;
	skeletonPath: string;
}

export interface OutputCollisionErrorOptions {
	cause?: unknown;
	code: OutputCollisionErrorCode;
	message: string;
	outputPath: string;
}

export interface RenderOptionValidationErrorOptions {
	cause?: unknown;
	code: RenderOptionValidationErrorCode;
	message: string;
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

export class SpineSelectionError extends Error {
	readonly availableNames: string[];
	declare readonly cause: unknown;
	readonly code: SpineSelectionErrorCode;
	readonly requestedName: string;
	readonly selectionType: SpineSelectionType;
	readonly skeletonPath: string;

	constructor(options: SpineSelectionErrorOptions) {
		super(options.message, { cause: options.cause });
		this.name = "SpineSelectionError";
		this.availableNames = options.availableNames;
		this.code = options.code;
		this.requestedName = options.requestedName;
		this.selectionType = options.selectionType;
		this.skeletonPath = options.skeletonPath;
	}
}

export class OutputCollisionError extends Error {
	declare readonly cause: unknown;
	readonly code: OutputCollisionErrorCode;
	readonly outputPath: string;

	constructor(options: OutputCollisionErrorOptions) {
		super(options.message, { cause: options.cause });
		this.name = "OutputCollisionError";
		this.code = options.code;
		this.outputPath = options.outputPath;
	}
}

export class RenderOptionValidationError extends Error {
	declare readonly cause: unknown;
	readonly code: RenderOptionValidationErrorCode;

	constructor(options: RenderOptionValidationErrorOptions) {
		super(options.message, { cause: options.cause });
		this.name = "RenderOptionValidationError";
		this.code = options.code;
	}
}

export function formatRenderErrorForCli(error: unknown): string {
	if (error instanceof OutputCollisionError) {
		return `Output already exists: ${error.outputPath}. Pass --overwrite to replace it.`;
	}

	if (error instanceof RenderOptionValidationError) {
		return error.message;
	}

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

	if (error instanceof SpineSelectionError) {
		return [
			`Unknown ${error.selectionType} "${error.requestedName}" in ${error.skeletonPath}.`,
			`Available ${error.selectionType}s: ${
				error.availableNames.length > 0 ? error.availableNames.join(", ") : "(none)"
			}.`,
		].join(" ");
	}

	if (error instanceof Error) {
		return error.message;
	}

	return String(error);
}

export function isSpineInputResolutionError(error: unknown): error is SpineInputResolutionError {
	return error instanceof SpineInputResolutionError;
}

export function isSpineSelectionError(error: unknown): error is SpineSelectionError {
	return error instanceof SpineSelectionError;
}

export function isOutputCollisionError(error: unknown): error is OutputCollisionError {
	return error instanceof OutputCollisionError;
}

export function isRenderOptionValidationError(
	error: unknown,
): error is RenderOptionValidationError {
	return error instanceof RenderOptionValidationError;
}

// Keep this guard in sync with the `RenderSpineError` union above.
export function isRenderSpineError(error: unknown): error is RenderSpineError {
	return (
		isOutputCollisionError(error) ||
		isRenderOptionValidationError(error) ||
		isSpineInputResolutionError(error) ||
		isSpineSelectionError(error)
	);
}
