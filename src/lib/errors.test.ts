import {
	OutputCollisionError,
	RenderOptionValidationError,
	SpineInputResolutionError,
	SpineSelectionError,
	isOutputCollisionError,
	isRenderOptionValidationError,
	isRenderSpineError,
	isSpineInputResolutionError,
	isSpineSelectionError,
} from "#/lib/errors.ts";
import { expect, test } from "vite-plus/test";

const outputCollisionError = new OutputCollisionError({
	code: "existing-output",
	message: "Output already exists.",
	outputPath: "out.apng",
});

const inputResolutionError = new SpineInputResolutionError({
	assetPath: "box.atlas",
	assetType: "atlas",
	code: "missing-asset",
	message: "Missing atlas input.",
});

const selectionError = new SpineSelectionError({
	availableNames: ["pulse"],
	code: "missing-selection",
	message: "Unknown animation.",
	requestedName: "missing",
	selectionType: "animation",
	skeletonPath: "box.json",
});

const optionValidationError = new RenderOptionValidationError({
	code: "unsupported-quality-output",
	message: "quality is only supported for lossy WebP output.",
});

test("isRenderSpineError accepts every member of the union", () => {
	expect(isRenderSpineError(outputCollisionError)).toBe(true);
	expect(isRenderSpineError(optionValidationError)).toBe(true);
	expect(isRenderSpineError(inputResolutionError)).toBe(true);
	expect(isRenderSpineError(selectionError)).toBe(true);
});

test("isRenderSpineError rejects errors outside the union", () => {
	expect(isRenderSpineError(new Error("plain"))).toBe(false);
	expect(isRenderSpineError("not an error")).toBe(false);
});

test("each typed guard matches only its own error", () => {
	expect(isOutputCollisionError(outputCollisionError)).toBe(true);
	expect(isOutputCollisionError(inputResolutionError)).toBe(false);

	expect(isRenderOptionValidationError(optionValidationError)).toBe(true);
	expect(isRenderOptionValidationError(selectionError)).toBe(false);

	expect(isSpineInputResolutionError(inputResolutionError)).toBe(true);
	expect(isSpineInputResolutionError(selectionError)).toBe(false);

	expect(isSpineSelectionError(selectionError)).toBe(true);
	expect(isSpineSelectionError(outputCollisionError)).toBe(false);
});
