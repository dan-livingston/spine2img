import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import {
	clippingFixtureSkeletonPath,
	decodeApngFrames,
	importPackageApi,
	readPixel,
} from "../helpers.ts";

// The clipping fixture stacks a 120x120 "shine" region over a 60x60 "base", with a
// 20x20 clipping mask whose range ends on the shine slot. Honoring the mask, the
// shine only contributes its central 20x20 — so the subject is the base's footprint.
// Ignoring the mask, the unclipped shine doubles every extent.

test("auto-fit bounds exclude the masked-away region of a clipped attachment", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-clip-bounds-"));

	try {
		const outputPath = path.join(tempDirectory, "clip.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpine({
			format: "apng",
			outputPath,
			skeletonPath: clippingFixtureSkeletonPath,
		});

		// Clipped to the base footprint (60x60, +1px from sub-pixel extent rounding),
		// not the unclipped shine's 120x120.
		expect(result.width).toBe(61);
		expect(result.height).toBe(60);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("a clipped attachment renders only inside its mask", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-clip-render-"));

	try {
		const outputPath = path.join(tempDirectory, "clip.apng");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpine({
			format: "apng",
			outputPath,
			skeletonPath: clippingFixtureSkeletonPath,
		});
		const { frames, width } = decodeApngFrames(await readFile(outputPath));
		const [frame] = frames;

		// Centre is inside the mask: the green shine wins over the red base.
		const centre = readPixel(
			frame,
			width,
			Math.floor(width / 2),
			Math.floor(result.height / 2),
		);
		expect(centre[1]).toBeGreaterThan(200);
		expect(centre[0]).toBeLessThan(60);
		expect(centre[3]).toBe(255);

		// The outer ring is on the base but outside the mask: the shine is clipped
		// away, leaving the red base — not the green shine bleeding past the mask.
		const outer = readPixel(frame, width, 6, 6);
		expect(outer[0]).toBeGreaterThan(200);
		expect(outer[1]).toBeLessThan(60);
		expect(outer[3]).toBe(255);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});
