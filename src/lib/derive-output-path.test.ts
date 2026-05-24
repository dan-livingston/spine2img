import { deriveOutputPath } from "#/lib/derive-output-path.ts";
import path from "node:path";
import { expect, test } from "vite-plus/test";

test("deriveOutputPath nests the animation under the skin directory", () => {
	expect(
		deriveOutputPath({
			animationName: "idle",
			format: "apng",
			outputDir: "/out",
			skinName: "default",
		}),
	).toBe(path.join("/out", "default", "idle.apng"));
});

test("deriveOutputPath maps the format to its file extension", () => {
	expect(
		deriveOutputPath({
			animationName: "idle",
			format: "webp",
			outputDir: "/out",
			skinName: "default",
		}),
	).toBe(path.join("/out", "default", "idle.webp"));
});

test("deriveOutputPath writes flat when the variation is skinless", () => {
	expect(
		deriveOutputPath({
			animationName: "idle",
			format: "apng",
			outputDir: "/out",
		}),
	).toBe(path.join("/out", "idle.apng"));
});
