import { RenderOptionValidationError } from "#/lib/errors.ts";
import { resolveLoop, resolveLoopPolicy } from "#/lib/resolve-loop.ts";
import { expect, test } from "vite-plus/test";

// Map equality reads more clearly as a plain object in the assertions below.
function counts(policy: Parameters<typeof resolveLoopPolicy>[0], names: string[]) {
	return Object.fromEntries(resolveLoopPolicy(policy, names));
}

test("resolveLoop defaults an omitted count to infinite (0)", () => {
	expect(resolveLoop()).toBe(0);
	expect(resolveLoop(undefined)).toBe(0);
});

test("resolveLoop preserves an explicit non-negative integer count", () => {
	expect(resolveLoop(0)).toBe(0);
	expect(resolveLoop(1)).toBe(1);
	expect(resolveLoop(42)).toBe(42);
});

test("resolveLoop rejects a negative count", () => {
	expect(() => resolveLoop(-1)).toThrowError(
		new RenderOptionValidationError({
			code: "invalid-loop",
			message: "loop must be a non-negative integer. Received -1.",
		}),
	);
});

test("resolveLoop rejects a non-integer count", () => {
	expect(() => resolveLoop(1.5)).toThrowError(
		new RenderOptionValidationError({
			code: "invalid-loop",
			message: "loop must be a non-negative integer. Received 1.5.",
		}),
	);
});

test("resolveLoop rejects NaN", () => {
	expect(() => resolveLoop(Number.NaN)).toThrowError(
		new RenderOptionValidationError({
			code: "invalid-loop",
			message: "loop must be a non-negative integer. Received NaN.",
		}),
	);
});

test("resolveLoop rejects Infinity", () => {
	expect(() => resolveLoop(Number.POSITIVE_INFINITY)).toThrowError(
		new RenderOptionValidationError({
			code: "invalid-loop",
			message: "loop must be a non-negative integer. Received Infinity.",
		}),
	);
});

test("resolveLoopPolicy treats a scalar as the default applied to every animation", () => {
	expect(counts(1, ["idle", "press"])).toEqual({ idle: 1, press: 1 });
	expect(counts(0, ["idle", "press"])).toEqual({ idle: 0, press: 0 });
});

test("resolveLoopPolicy defaults an omitted policy to infinite (0) for every animation", () => {
	expect(counts(undefined, ["idle", "press"])).toEqual({ idle: 0, press: 0 });
	expect(counts({}, ["idle", "press"])).toEqual({ idle: 0, press: 0 });
});

test("resolveLoopPolicy applies the object default to unmatched animations", () => {
	expect(counts({ default: 1 }, ["idle", "press"])).toEqual({ idle: 1, press: 1 });
});

test("resolveLoopPolicy resolves once globs to 1 and infinite globs to 0", () => {
	// Mostly-one-shot batch: default play-once, except the seamless families.
	expect(
		counts({ default: 1, infinite: ["*Idle*", "*Hover*"] }, ["IconIdle", "IconHover", "Press"]),
	).toEqual({ IconHover: 0, IconIdle: 0, Press: 1 });

	// Mostly-loop batch: infinite default, except the one-shots.
	expect(
		counts({ once: ["*Press*", "*FadeOff*"] }, ["IconIdle", "IconPress", "IconFadeOff"]),
	).toEqual({ IconFadeOff: 1, IconIdle: 0, IconPress: 1 });
});

test("resolveLoopPolicy matches anchored on the whole name", () => {
	// A bare `Idle` matches only the literal animation `Idle`, not the family — use
	// `*Idle*` for that. `IconIdle` keeps the default despite containing "Idle".
	expect(counts({ default: 1, infinite: ["Idle"] }, ["Idle", "IconIdle"])).toEqual({
		Idle: 0,
		IconIdle: 1,
	});
});

test("resolveLoopPolicy matches case-sensitively", () => {
	// `*Idle*` matches the capitalized family but not a lowercase `idle`.
	expect(counts({ default: 1, infinite: ["*Idle*"] }, ["IconIdle", "lowidle"])).toEqual({
		IconIdle: 0,
		lowidle: 1,
	});
});

test("resolveLoopPolicy lets * cross / so a family pattern ignores grouping separators", () => {
	expect(counts({ default: 1, infinite: ["*Idle*"] }, ["group/IconIdle", "Press"])).toEqual({
		Press: 1,
		"group/IconIdle": 0,
	});

	// A pattern that does spell out a grouping segment still lines up.
	expect(counts({ default: 1, infinite: ["group/*"] }, ["group/IconIdle", "Press"])).toEqual({
		Press: 1,
		"group/IconIdle": 0,
	});
});

test("resolveLoopPolicy lets patterns that agree on a count overlap without conflict", () => {
	// Two `once` patterns both claiming one animation agree on `1`, so no conflict.
	expect(counts({ once: ["*Press*", "Icon*"] }, ["IconPress"])).toEqual({ IconPress: 1 });
});

test("resolveLoopPolicy rejects a pattern that matches no animation", () => {
	expect(() => resolveLoopPolicy({ infinite: ["*Nope*"] }, ["Idle", "Press"])).toThrowError(
		new RenderOptionValidationError({
			code: "loop-pattern-no-match",
			message: 'Loop pattern "*Nope*" matched no animations.',
		}),
	);
});

test("resolveLoopPolicy rejects an animation assigned conflicting counts, naming both patterns", () => {
	expect(() =>
		resolveLoopPolicy({ infinite: ["IconActivePress"], once: ["*Press*"] }, [
			"IconActivePress",
			"IconIdle",
		]),
	).toThrowError(
		new RenderOptionValidationError({
			code: "loop-pattern-conflict",
			message:
				'Animation "IconActivePress" is matched by conflicting loop patterns: "*Press*", "IconActivePress".',
		}),
	);
});

test("resolveLoopPolicy rejects an invalid default count", () => {
	expect(() => resolveLoopPolicy({ default: -1 }, ["idle"])).toThrowError(
		new RenderOptionValidationError({
			code: "invalid-loop",
			message: "loop must be a non-negative integer. Received -1.",
		}),
	);
	expect(() => resolveLoopPolicy(1.5, ["idle"])).toThrowError(
		new RenderOptionValidationError({
			code: "invalid-loop",
			message: "loop must be a non-negative integer. Received 1.5.",
		}),
	);
});
