import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import { decodeApng, renderAllFixtureSkeletonPath, runCli } from "../helpers.ts";

test("packed package CLI render-all renders every animation of the default skin", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-render-all-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const { stdout } = await runCli(["render-all", renderAllFixtureSkeletonPath, outputDir]);

		// Output groups under a single `default/` skin directory and nothing else.
		expect(await readdir(outputDir)).toEqual(["default"]);

		const skinDirectory = path.join(outputDir, "default");
		expect((await readdir(skinDirectory)).sort()).toEqual([
			"hover.apng",
			"idle.apng",
			"press.apng",
		]);

		const idle = decodeApng(await readFile(path.join(skinDirectory, "idle.apng")));
		expect(idle).toEqual({
			frameCount: 30,
			height: 64,
			width: 97,
		});

		// Per-variation progress lines plus a final summary.
		expect(stdout).toContain("default/idle");
		expect(stdout).toContain("default/hover");
		expect(stdout).toContain("default/press");
		expect(stdout).toContain("Rendered 3 variations");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});
