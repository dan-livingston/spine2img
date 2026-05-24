import { enumerateVariations } from "#/lib/enumerate-variations.ts";
import { expect, test } from "vite-plus/test";

test("enumerateVariations renders every animation of the default skin", () => {
	expect(
		enumerateVariations({
			animationNames: ["idle", "hover", "press"],
			skinNames: ["default"],
		}),
	).toEqual([
		{ animationName: "idle", skinName: "default" },
		{ animationName: "hover", skinName: "default" },
		{ animationName: "press", skinName: "default" },
	]);
});

test("enumerateVariations sticks to the default skin even when named skins exist", () => {
	expect(
		enumerateVariations({
			animationNames: ["idle"],
			skinNames: ["default", "alt"],
		}),
	).toEqual([{ animationName: "idle", skinName: "default" }]);
});

test("enumerateVariations uses the sole skin when there is no default", () => {
	expect(
		enumerateVariations({
			animationNames: ["idle", "hover"],
			skinNames: ["only"],
		}),
	).toEqual([
		{ animationName: "idle", skinName: "only" },
		{ animationName: "hover", skinName: "only" },
	]);
});

test("enumerateVariations renders skinless when the skeleton has no skins", () => {
	expect(
		enumerateVariations({
			animationNames: ["idle"],
			skinNames: [],
		}),
	).toEqual([{ animationName: "idle", skinName: undefined }]);
});

test("enumerateVariations preserves skeleton-declared animation order", () => {
	const variations = enumerateVariations({
		animationNames: ["c", "a", "b"],
		skinNames: ["default"],
	});

	expect(variations.map((variation) => variation.animationName)).toEqual(["c", "a", "b"]);
});
