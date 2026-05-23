import { RenderOptionValidationError } from "#/lib/errors.ts";
import { resolveEncodeOptions } from "#/lib/resolve-encode-options.ts";
import { expect, test } from "vite-plus/test";

test("resolveEncodeOptions defaults both formats to lossless output", () => {
	expect(resolveEncodeOptions({ format: "apng" })).toEqual({
		lossless: true,
	});
	expect(resolveEncodeOptions({ format: "webp" })).toEqual({
		lossless: true,
	});
});

test("resolveEncodeOptions applies the default lossy WebP quality", () => {
	expect(
		resolveEncodeOptions({
			format: "webp",
			lossless: false,
		}),
	).toEqual({
		lossless: false,
		quality: 80,
	});
});

test("resolveEncodeOptions preserves an explicit lossy WebP quality", () => {
	expect(
		resolveEncodeOptions({
			format: "webp",
			lossless: false,
			quality: 27,
		}),
	).toEqual({
		lossless: false,
		quality: 27,
	});
});

test("resolveEncodeOptions rejects lossy APNG output", () => {
	expect(() =>
		resolveEncodeOptions({
			format: "apng",
			lossless: false,
		}),
	).toThrowError(
		new RenderOptionValidationError({
			code: "unsupported-lossy-output",
			message: "lossless: false is only supported for WebP output.",
		}),
	);
});

test("resolveEncodeOptions rejects quality for APNG output", () => {
	expect(() =>
		resolveEncodeOptions({
			format: "apng",
			quality: 80,
		}),
	).toThrowError(
		new RenderOptionValidationError({
			code: "unsupported-quality-output",
			message: "quality is only supported for lossy WebP output.",
		}),
	);
});

test("resolveEncodeOptions rejects quality for lossless WebP output", () => {
	expect(() =>
		resolveEncodeOptions({
			format: "webp",
			quality: 80,
		}),
	).toThrowError(
		new RenderOptionValidationError({
			code: "unsupported-quality-output",
			message: "quality is only supported for lossy WebP output.",
		}),
	);
});

test("resolveEncodeOptions reports unsupported quality before its range for incompatible targets", () => {
	// An out-of-range quality on a target that doesn't accept quality at all should
	// surface the compatibility error, not a range message that fixes the wrong thing.
	expect(() =>
		resolveEncodeOptions({
			format: "apng",
			quality: 200,
		}),
	).toThrowError(
		new RenderOptionValidationError({
			code: "unsupported-quality-output",
			message: "quality is only supported for lossy WebP output.",
		}),
	);
	expect(() =>
		resolveEncodeOptions({
			format: "webp",
			quality: 200,
		}),
	).toThrowError(
		new RenderOptionValidationError({
			code: "unsupported-quality-output",
			message: "quality is only supported for lossy WebP output.",
		}),
	);
});

test("resolveEncodeOptions validates the quality range", () => {
	expect(() =>
		resolveEncodeOptions({
			format: "webp",
			lossless: false,
			quality: 101,
		}),
	).toThrowError(
		new RenderOptionValidationError({
			code: "invalid-quality",
			message: "quality must be a number between 0 and 100. Received 101.",
		}),
	);
});
