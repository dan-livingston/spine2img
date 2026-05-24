export {
	OutputCollisionError,
	OutputPathError,
	type RenderSpineError,
	RenderOptionValidationError,
	SpineInputResolutionError,
	SpineSelectionError,
	type OutputCollisionErrorCode,
	type OutputPathErrorCode,
	type RenderOptionValidationErrorCode,
	type SpineInputAssetType,
	type SpineInputResolutionErrorCode,
	type SpineSelectionErrorCode,
	type SpineSelectionType,
	isOutputCollisionError,
	isOutputPathError,
	isRenderOptionValidationError,
	isRenderSpineError,
	isSpineInputResolutionError,
	isSpineSelectionError,
} from "./lib/errors.ts";
export {
	type OutputFormat,
	renderSpine,
	renderSpineToApng,
	renderSpineToWebp,
	type RenderSpineOptions,
	type RenderSpineResult,
} from "#/render-spine.ts";
export {
	renderSpineVariations,
	type RenderSpineVariationsOptions,
	type RenderSpineVariationsResult,
} from "#/render-spine-variations.ts";
