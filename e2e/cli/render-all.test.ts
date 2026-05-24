import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import { decodeApng, renderAllFixtureSkeletonPath, runCli } from "../helpers.ts";

test("packed package CLI render-all renders the cross-product across named skins", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-render-all-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const { stdout } = await runCli(["render-all", renderAllFixtureSkeletonPath, outputDir]);

		// Output groups under one directory per named skin; the base `default` skin
		// is excluded.
		expect((await readdir(outputDir)).sort()).toEqual(["alt", "wide"]);

		for (const skinName of ["alt", "wide"]) {
			expect((await readdir(path.join(outputDir, skinName))).sort()).toEqual([
				"hover.apng",
				"idle.apng",
				"press.apng",
			]);
		}

		const altIdle = decodeApng(await readFile(path.join(outputDir, "alt", "idle.apng")));
		const wideIdle = decodeApng(await readFile(path.join(outputDir, "wide", "idle.apng")));
		expect(altIdle.frameCount).toBe(30);
		expect(wideIdle.frameCount).toBe(30);
		// The skins carry differently-sized boxes, so the same animation renders at
		// different widths — proof each skin actually applied.
		expect(altIdle.width).toBeLessThan(wideIdle.width);

		// Per-variation progress lines plus a final summary across both skins.
		expect(stdout).toContain("alt/idle");
		expect(stdout).toContain("wide/idle");
		expect(stdout).toContain("Rendered 6 variations");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI render-all narrows to a repeatable --skin subset", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-render-all-subset-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const { stdout } = await runCli([
			"render-all",
			renderAllFixtureSkeletonPath,
			outputDir,
			"--skin",
			"wide",
		]);

		expect(await readdir(outputDir)).toEqual(["wide"]);
		expect((await readdir(path.join(outputDir, "wide"))).sort()).toEqual([
			"hover.apng",
			"idle.apng",
			"press.apng",
		]);
		expect(stdout).toContain("Rendered 3 variations");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});
