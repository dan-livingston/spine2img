import {
	OutputCollisionError,
	OutputPathError,
	RenderOptionValidationError,
	SpineInputResolutionError,
	SpineSelectionError,
	formatRenderErrorForCli,
	isOutputCollisionError,
	isOutputPathError,
	isRenderOptionValidationError,
	isRenderSpineError,
	isSpineInputResolutionError,
	isSpineSelectionError,
	serializeRenderErrorForJson,
} from "#/lib/errors.ts";
import { expect, test } from "vite-plus/test";

const outputCollisionError = new OutputCollisionError({
	code: "existing-output",
	message: "Output already exists.",
	outputPath: "out.apng",
});

const outputPathError = new OutputPathError({
	code: "unsafe-output-path",
	message: "Unsafe output name.",
	outputDir: "/out",
	unsafeName: "../escape",
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
	expect(isRenderSpineError(outputPathError)).toBe(true);
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

	expect(isOutputPathError(outputPathError)).toBe(true);
	expect(isOutputPathError(outputCollisionError)).toBe(false);
});

test("formatRenderErrorForCli lists every collision when a batch gate finds more than one", () => {
	const message = formatRenderErrorForCli(
		new OutputCollisionError({
			code: "existing-output",
			message: "2 outputs already exist.",
			outputPath: "/out/alt/idle.apng",
			outputPaths: ["/out/alt/idle.apng", "/out/alt/hover.apng"],
		}),
	);

	expect(message).toContain("Outputs already exist:");
	expect(message).toContain("/out/alt/idle.apng");
	expect(message).toContain("/out/alt/hover.apng");
	expect(message).toContain("Pass --overwrite to replace them.");
});

test("formatRenderErrorForCli keeps the singular phrasing for a lone collision", () => {
	expect(formatRenderErrorForCli(outputCollisionError)).toBe(
		"Output already exists: out.apng. Pass --overwrite to replace it.",
	);
});

test("formatRenderErrorForCli names the offending segment for an unsafe output path", () => {
	expect(formatRenderErrorForCli(outputPathError)).toBe(
		'Unsafe output name "../escape": a name cannot contain ".." or absolute path segments.',
	);
});

test("formatRenderErrorForCli explains a skeleton that defines no animations", () => {
	expect(
		formatRenderErrorForCli(
			new SpineInputResolutionError({
				assetPath: "button.json",
				assetType: "skeleton",
				code: "no-animations",
				message: "Skeleton defines no animations.",
			}),
		),
	).toBe("Skeleton defines no animations: button.json.");
});

test("serializeRenderErrorForJson keeps the name, code, and message of a typed error", () => {
	expect(serializeRenderErrorForJson(selectionError)).toEqual({
		code: "missing-selection",
		message: "Unknown animation.",
		name: "SpineSelectionError",
	});
});

test("serializeRenderErrorForJson omits code for a plain Error", () => {
	const serialized = serializeRenderErrorForJson(new Error("render failed for boom"));

	expect(serialized).toEqual({ message: "render failed for boom", name: "Error" });
	expect(serialized).not.toHaveProperty("code");
});

test("serializeRenderErrorForJson survives JSON round-tripping where a raw Error would not", () => {
	const error = new Error("boom");

	// A raw Error stringifies to an empty object; the projection keeps the cause.
	expect(JSON.stringify(error)).toBe("{}");
	expect(JSON.parse(JSON.stringify(serializeRenderErrorForJson(error)))).toEqual({
		message: "boom",
		name: "Error",
	});
});

test("serializeRenderErrorForJson coerces a non-Error throw", () => {
	expect(serializeRenderErrorForJson("not an error")).toEqual({
		message: "not an error",
		name: "Error",
	});
});
