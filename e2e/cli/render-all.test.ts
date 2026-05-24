import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import { decodeApng, decodeWebpFrames, renderAllFixtureSkeletonPath, runCli } from "../helpers.ts";

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

test("packed package CLI render-all registers a skin by default and --tight opts out", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-render-all-tight-"));

	try {
		const registeredDir = path.join(tempDirectory, "registered");
		await runCli(["render-all", renderAllFixtureSkeletonPath, registeredDir, "--skin", "alt"]);

		const registeredIdle = decodeApng(
			await readFile(path.join(registeredDir, "alt", "idle.apng")),
		);
		const registeredHover = decodeApng(
			await readFile(path.join(registeredDir, "alt", "hover.apng")),
		);
		// Registered: every animation in the skin shares one canvas.
		expect(registeredIdle.width).toBe(registeredHover.width);
		expect(registeredIdle.height).toBe(registeredHover.height);

		const tightDir = path.join(tempDirectory, "tight");
		await runCli([
			"render-all",
			renderAllFixtureSkeletonPath,
			tightDir,
			"--skin",
			"alt",
			"--tight",
		]);

		const tightIdle = decodeApng(await readFile(path.join(tightDir, "alt", "idle.apng")));
		const tightHover = decodeApng(await readFile(path.join(tightDir, "alt", "hover.apng")));
		// --tight: each animation auto-fits to its own bounds, so the two differ.
		expect(tightIdle.width !== tightHover.width || tightIdle.height !== tightHover.height).toBe(
			true,
		);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI render-all --width/--height force a uniform canvas", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-render-all-size-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		await runCli([
			"render-all",
			renderAllFixtureSkeletonPath,
			outputDir,
			"--width",
			"100",
			"--height",
			"80",
		]);

		for (const skinName of ["alt", "wide"]) {
			for (const animation of ["hover", "idle", "press"]) {
				const decoded = decodeApng(
					await readFile(path.join(outputDir, skinName, `${animation}.apng`)),
				);
				expect(decoded.width).toBe(100);
				expect(decoded.height).toBe(80);
			}
		}
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI render-all --format webp writes WebP files", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-render-all-webp-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const { stdout } = await runCli([
			"render-all",
			renderAllFixtureSkeletonPath,
			outputDir,
			"--format",
			"webp",
			"--skin",
			"alt",
		]);

		// Generated extensions follow the chosen format.
		expect((await readdir(path.join(outputDir, "alt"))).sort()).toEqual([
			"hover.webp",
			"idle.webp",
			"press.webp",
		]);

		const idle = await decodeWebpFrames(
			await readFile(path.join(outputDir, "alt", "idle.webp")),
		);
		expect(idle.format).toBe("webp");
		expect(idle.frames).toHaveLength(30);
		expect(stdout).toContain("Rendered 3 variations");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI render-all rejects lossy encoding on the APNG default", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-render-all-lossy-"));

	try {
		const outputDir = path.join(tempDirectory, "out");

		let error: unknown;

		try {
			await runCli(["render-all", renderAllFixtureSkeletonPath, outputDir, "--no-lossless"]);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { code?: number }).code).not.toBe(0);
		expect((error as { stderr?: string }).stderr).toContain(
			"lossless: false is only supported for WebP output.",
		);
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
