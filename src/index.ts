export {
	OutputCollisionError,
	type RenderSpineError,
	SpineInputResolutionError,
	SpineSelectionError,
	type OutputCollisionErrorCode,
	type SpineInputAssetType,
	type SpineInputResolutionErrorCode,
	type SpineSelectionErrorCode,
	type SpineSelectionType,
	isOutputCollisionError,
	isRenderSpineError,
	isSpineInputResolutionError,
	isSpineSelectionError,
} from "./lib/errors.ts";
export {
	type OutputFormat,
	renderSpine,
	renderSpineToApng,
	type RenderSpineOptions,
	type RenderSpineResult,
} from "#/render-spine.ts";
