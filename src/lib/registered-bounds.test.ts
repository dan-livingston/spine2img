import type { Bounds } from "#/lib/renderer-backend.ts";

import { unionBounds } from "#/lib/registered-bounds.ts";
import { expect, test } from "vite-plus/test";

function bounds(minX: number, minY: number, maxX: number, maxY: number): Bounds {
	return {
		height: Math.max(1, Math.ceil(maxY - minY)),
		maxX,
		maxY,
		minX,
		minY,
		width: Math.max(1, Math.ceil(maxX - minX)),
	};
}

test("unionBounds spans the extent of every input and recomputes the size", () => {
	expect(
		unionBounds([bounds(-16, -16, 16, 16), bounds(0, -8, 48, 40), bounds(-32, 0, 8, 8)]),
	).toEqual({
		height: 56,
		maxX: 48,
		maxY: 40,
		minX: -32,
		minY: -16,
		width: 80,
	});
});

test("unionBounds keeps the shared origin so registered states stay aligned", () => {
	const union = unionBounds([bounds(-10, -4, 10, 4), bounds(-2, -20, 30, 6)]);

	// The origin is the min of every input's origin, not any single animation's.
	expect(union.minX).toBe(-10);
	expect(union.minY).toBe(-20);
});

test("unionBounds of a single animation is that animation's bounds", () => {
	expect(unionBounds([bounds(-5, -7, 11, 9)])).toEqual(bounds(-5, -7, 11, 9));
});

test("unionBounds rounds a fractional extent up to whole pixels", () => {
	const union = unionBounds([bounds(-0.4, -0.2, 10.6, 5.9)]);

	expect(union.width).toBe(11);
	expect(union.height).toBe(7);
});
