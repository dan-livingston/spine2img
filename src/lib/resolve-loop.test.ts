import { RenderOptionValidationError } from "#/lib/errors.ts";
import { resolveLoop } from "#/lib/resolve-loop.ts";
import { expect, test } from "vite-plus/test";

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
