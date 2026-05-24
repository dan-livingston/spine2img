import { enumerateVariations } from "#/lib/enumerate-variations.ts";
import { SpineSelectionError } from "#/lib/errors.ts";
import { expect, test } from "vite-plus/test";

const skeletonPath = "/skeleton.json";

test("enumerateVariations renders the animations × skins cross-product, skin-major", () => {
	expect(
		enumerateVariations({
			animationNames: ["idle", "hover"],
			skeletonPath,
			skinNames: ["default", "alt", "wide"],
		}),
	).toEqual([
		{ animationName: "idle", skinName: "alt" },
		{ animationName: "hover", skinName: "alt" },
		{ animationName: "idle", skinName: "wide" },
		{ animationName: "hover", skinName: "wide" },
	]);
});

test("enumerateVariations excludes the default skin when named skins exist", () => {
	const variations = enumerateVariations({
		animationNames: ["idle"],
		skeletonPath,
		skinNames: ["default", "alt", "wide"],
	});

	expect(variations.map((variation) => variation.skinName)).toEqual(["alt", "wide"]);
});

test("enumerateVariations uses the default skin when it is the only skin", () => {
	expect(
		enumerateVariations({
			animationNames: ["idle", "hover"],
			skeletonPath,
			skinNames: ["default"],
		}),
	).toEqual([
		{ animationName: "idle", skinName: "default" },
		{ animationName: "hover", skinName: "default" },
	]);
});

test("enumerateVariations uses the sole named skin when there is no default", () => {
	expect(
		enumerateVariations({
			animationNames: ["idle", "hover"],
			skeletonPath,
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
			animationNames: ["idle", "hover"],
			skeletonPath,
			skinNames: [],
		}),
	).toEqual([
		{ animationName: "idle", skinName: undefined },
		{ animationName: "hover", skinName: undefined },
	]);
});

test("enumerateVariations narrows to a requested skin subset", () => {
	const variations = enumerateVariations({
		animationNames: ["idle"],
		requestedSkinNames: ["wide"],
		skeletonPath,
		skinNames: ["default", "alt", "wide"],
	});

	expect(variations).toEqual([{ animationName: "idle", skinName: "wide" }]);
});

test("enumerateVariations narrows in skeleton-declared order regardless of request order", () => {
	const variations = enumerateVariations({
		animationNames: ["idle"],
		requestedSkinNames: ["wide", "alt"],
		skeletonPath,
		skinNames: ["default", "alt", "wide"],
	});

	expect(variations.map((variation) => variation.skinName)).toEqual(["alt", "wide"]);
});

test("enumerateVariations forces the default skin when it is explicitly requested", () => {
	expect(
		enumerateVariations({
			animationNames: ["idle"],
			requestedSkinNames: ["default"],
			skeletonPath,
			skinNames: ["default", "alt", "wide"],
		}),
	).toEqual([{ animationName: "idle", skinName: "default" }]);
});

test("enumerateVariations raises a typed SpineSelectionError for an unknown requested skin", () => {
	let error: unknown;

	try {
		enumerateVariations({
			animationNames: ["idle"],
			requestedSkinNames: ["missing"],
			skeletonPath,
			skinNames: ["default", "alt", "wide"],
		});
	} catch (caught) {
		error = caught;
	}

	expect(error).toBeInstanceOf(SpineSelectionError);
	expect(error).toMatchObject({
		availableNames: ["default", "alt", "wide"],
		code: "missing-selection",
		requestedName: "missing",
		selectionType: "skin",
		skeletonPath,
	});
});

test("enumerateVariations preserves skeleton-declared animation order within a skin", () => {
	const variations = enumerateVariations({
		animationNames: ["c", "a", "b"],
		skeletonPath,
		skinNames: ["default"],
	});

	expect(variations.map((variation) => variation.animationName)).toEqual(["c", "a", "b"]);
});
