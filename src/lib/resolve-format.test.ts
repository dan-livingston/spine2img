import { resolveFormat } from "#/lib/resolve-format.ts";
import { expect, test } from "vite-plus/test";

test("resolveFormat prefers an explicit format over the output extension", () => {
	expect(
		resolveFormat({
			format: "webp",
			outputPath: "out.apng",
		}),
	).toBe("webp");
});

test("resolveFormat infers WebP from .webp output paths", () => {
	expect(
		resolveFormat({
			outputPath: "out.webp",
		}),
	).toBe("webp");
});

test("resolveFormat infers APNG from .png and .apng output paths", () => {
	expect(
		resolveFormat({
			outputPath: "out.png",
		}),
	).toBe("apng");
	expect(
		resolveFormat({
			outputPath: "out.apng",
		}),
	).toBe("apng");
});

test("resolveFormat falls back to APNG for unrecognized extensions", () => {
	expect(
		resolveFormat({
			outputPath: "out.gif",
		}),
	).toBe("apng");
	expect(
		resolveFormat({
			outputPath: "out",
		}),
	).toBe("apng");
	// A bare `.webp` is a dotfile with no stem, so `path.extname` reports no
	// extension and the inferred type matches this APNG fallback.
	expect(
		resolveFormat({
			outputPath: ".webp",
		}),
	).toBe("apng");
});

test("resolveFormat honors an explicit format even when it contradicts the extension", () => {
	expect(
		resolveFormat({
			format: "apng",
			outputPath: "out.webp",
		}),
	).toBe("apng");
});
