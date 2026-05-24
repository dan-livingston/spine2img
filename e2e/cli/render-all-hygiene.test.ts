import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import {
	createRenderAllFixture,
	decodeApng,
	MINIMAL_ANIMATION,
	renderAllFixtureSkeletonPath,
	runCli,
} from "../helpers.ts";

test("packed package CLI render-all fails fast and lists collisions without --overwrite", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-collision-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		await runCli(["render-all", renderAllFixtureSkeletonPath, outputDir, "--skin", "alt"]);

		const idlePath = path.join(outputDir, "alt", "idle.apng");
		const originalIdle = await readFile(idlePath);

		let error: unknown;

		try {
			await runCli(["render-all", renderAllFixtureSkeletonPath, outputDir, "--skin", "alt"]);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { code?: number }).code).not.toBe(0);
		expect((error as { stderr?: string }).stderr).toContain("Outputs already exist:");
		expect((error as { stderr?: string }).stderr).toContain(idlePath);
		expect((error as { stderr?: string }).stderr).toContain(
			"Pass --overwrite to replace them.",
		);
		// The gate ran before any write, so the existing file is intact.
		expect(await readFile(idlePath)).toEqual(originalIdle);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI render-all --overwrite replaces an existing batch", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-overwrite-batch-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		await runCli(["render-all", renderAllFixtureSkeletonPath, outputDir, "--skin", "alt"]);

		const { stdout } = await runCli([
			"render-all",
			renderAllFixtureSkeletonPath,
			outputDir,
			"--skin",
			"alt",
			"--overwrite",
		]);

		expect(stdout).toContain("Rendered 3 variations");
		expect(
			decodeApng(await readFile(path.join(outputDir, "alt", "idle.apng"))).frameCount,
		).toBe(30);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI render-all exits non-zero when a variation fails", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-partial-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		// A directory squatting on one target makes only that write fail (EISDIR);
		// --overwrite skips the gate so the write is attempted and faults.
		await mkdir(path.join(outputDir, "alt", "idle.apng"), { recursive: true });

		let error: unknown;

		try {
			await runCli([
				"render-all",
				renderAllFixtureSkeletonPath,
				outputDir,
				"--skin",
				"alt",
				"--overwrite",
			]);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { code?: number }).code).not.toBe(0);
		expect((error as { stderr?: string }).stderr).toContain("Failed alt/idle");
		expect((error as { stdout?: string }).stdout).toContain("Rendered 2 variations");
		expect((error as { stdout?: string }).stdout).toContain("(1 failed)");
		// The healthy siblings still rendered.
		expect((await readdir(path.join(outputDir, "alt"))).sort()).toContain("hover.apng");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI render-all rejects a traversal in an animation name", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-escape-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const skeletonPath = await createRenderAllFixture(tempDirectory, (skeleton) => {
			skeleton.animations["../../pwned"] = MINIMAL_ANIMATION;
		});

		let error: unknown;

		try {
			await runCli(["render-all", skeletonPath, outputDir, "--skin", "alt"]);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { code?: number }).code).not.toBe(0);
		expect((error as { stderr?: string }).stderr).toContain('Unsafe output name "../../pwned"');
		// Nothing escaped to the parent directory.
		expect(await readdir(tempDirectory)).not.toContain("pwned.apng");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});
