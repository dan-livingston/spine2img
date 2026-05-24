import { deriveOutputPath } from "#/lib/derive-output-path.ts";
import { OutputPathError } from "#/lib/errors.ts";
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

test("deriveOutputPath turns a slash in a name into nested directories", () => {
	expect(
		deriveOutputPath({
			animationName: "states/idle",
			format: "apng",
			outputDir: "/out",
			skinName: "ui/default",
		}),
	).toBe(path.join("/out", "ui", "default", "states", "idle.apng"));
});

test("deriveOutputPath rejects a traversal in the animation name", () => {
	let error: unknown;

	try {
		deriveOutputPath({
			animationName: "../escape",
			format: "apng",
			outputDir: "/out",
			skinName: "alt",
		});
	} catch (caught) {
		error = caught;
	}

	expect(error).toBeInstanceOf(OutputPathError);
	expect(error).toMatchObject({
		code: "unsafe-output-path",
		outputDir: "/out",
		unsafeName: "../escape",
	});
});

test("deriveOutputPath rejects a traversal nested inside the animation name", () => {
	expect(() =>
		deriveOutputPath({
			animationName: "a/../../escape",
			format: "apng",
			outputDir: "/out",
			skinName: "alt",
		}),
	).toThrow(OutputPathError);
});

test("deriveOutputPath rejects a traversal in the skin name", () => {
	let error: unknown;

	try {
		deriveOutputPath({
			animationName: "idle",
			format: "apng",
			outputDir: "/out",
			skinName: "../escape",
		});
	} catch (caught) {
		error = caught;
	}

	expect(error).toBeInstanceOf(OutputPathError);
	expect(error).toMatchObject({ code: "unsafe-output-path", unsafeName: "../escape" });
});

test("deriveOutputPath rejects an absolute name", () => {
	expect(() =>
		deriveOutputPath({
			animationName: "/etc/passwd",
			format: "apng",
			outputDir: "/out",
			skinName: "alt",
		}),
	).toThrow(OutputPathError);
});
