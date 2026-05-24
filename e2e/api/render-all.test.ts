import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import { decodeApng, importPackageApi, renderAllFixtureSkeletonPath } from "../helpers.ts";

test("packed package API renders every animation of the default skin to the output directory", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-render-all-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineVariations({
			outputDir,
			skeletonPath: renderAllFixtureSkeletonPath,
		});

		expect(result.outputDir).toBe(outputDir);
		expect(result.format).toBe("apng");
		expect(result.lossless).toBe(true);
		expect(result.skinNames).toEqual(["default"]);
		expect(result.failed).toEqual([]);
		expect(result.durationMs).toBeGreaterThanOrEqual(0);

		// One success per animation, each carrying the single-render result shape.
		expect(result.succeeded.map((entry) => entry.animationName).sort()).toEqual([
			"hover",
			"idle",
			"press",
		]);
		expect(
			result.succeeded.every(
				(entry) => entry.format === "apng" && entry.skinName === "default",
			),
		).toBe(true);

		const idleResult = result.succeeded.find((entry) => entry.animationName === "idle");
		expect(idleResult).toBeDefined();
		expect(idleResult?.outputPath).toBe(path.join(outputDir, "default", "idle.apng"));

		const decoded = decodeApng(await readFile(idleResult?.outputPath ?? ""));
		expect(decoded.frameCount).toBe(idleResult?.frameCount);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});
