import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import {
	decodeApng,
	decodeApngLoop,
	decodeWebpFrames,
	renderAllFixtureSkeletonPath,
	runCli,
} from "../helpers.ts";

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

test("packed package CLI render-all --loop embeds the count in every file", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-render-all-loop-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const { stdout } = await runCli([
			"render-all",
			renderAllFixtureSkeletonPath,
			outputDir,
			"--skin",
			"alt",
			"--loop",
			"1",
			"--json",
		]);
		const result = JSON.parse(stdout) as {
			succeeded: { loop: number; outputPath: string }[];
		};

		// Every entry in the summary reports the resolved count...
		expect(result.succeeded).toHaveLength(3);
		expect(result.succeeded.every((entry) => entry.loop === 1)).toBe(true);

		// ...and every written file decodes to it.
		for (const entry of result.succeeded) {
			expect(decodeApngLoop(await readFile(entry.outputPath))).toBe(1);
		}
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI render-all rejects an invalid --loop up front", async () => {
	const tempDirectory = await mkdtemp(
		path.join(os.tmpdir(), "spine2img-cli-render-all-bad-loop-"),
	);

	try {
		const outputDir = path.join(tempDirectory, "out");

		let error: unknown;

		try {
			await runCli(["render-all", renderAllFixtureSkeletonPath, outputDir, "--loop", "1.5"]);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { code?: number }).code).not.toBe(0);
		expect((error as { stderr?: string }).stderr).toContain(
			"loop must be a non-negative integer.",
		);

		// Fail-fast: nothing was rendered, so the output directory was never created.
		let listing: string[] | undefined;
		try {
			listing = await readdir(outputDir);
		} catch {
			listing = undefined;
		}
		expect(listing).toBeUndefined();
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

test("packed package CLI render-all --json prints only the structured summary", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-render-all-json-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const { stdout } = await runCli([
			"render-all",
			renderAllFixtureSkeletonPath,
			outputDir,
			"--skin",
			"alt",
			"--json",
		]);

		// Only the summary object lands on stdout: it parses as one JSON value, and no
		// per-variation progress chatter leaked into the stream.
		expect(stdout.trimStart().startsWith("{")).toBe(true);
		expect(stdout).not.toContain("Rendered 3 variations");

		const result = JSON.parse(stdout) as {
			durationMs: number;
			failed: unknown[];
			format: string;
			lossless: boolean;
			outputDir: string;
			quality?: number;
			skinNames: string[];
			succeeded: { animationName: string; outputPath: string; skinName?: string }[];
		};

		expect(result.outputDir).toBe(outputDir);
		expect(result.format).toBe("apng");
		expect(result.lossless).toBe(true);
		expect(result).not.toHaveProperty("quality");
		expect(result.skinNames).toEqual(["alt"]);
		expect(result.failed).toEqual([]);
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
		expect(result.succeeded.map((entry) => entry.animationName).sort()).toEqual([
			"hover",
			"idle",
			"press",
		]);
		expect(result.succeeded.every((entry) => entry.skinName === "alt")).toBe(true);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI render-all --json reports failures and exits non-zero", async () => {
	const tempDirectory = await mkdtemp(
		path.join(os.tmpdir(), "spine2img-cli-render-all-json-fail-"),
	);

	try {
		const outputDir = path.join(tempDirectory, "out");
		// A directory squatting on one target makes only that write fail; --overwrite
		// skips the upfront gate so the write is attempted and faults mid-run.
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
				"--json",
			]);
		} catch (caught) {
			error = caught;
		}

		// A collected per-variation failure forces a non-zero exit.
		expect(error).toBeInstanceOf(Error);
		expect((error as { code?: number }).code).not.toBe(0);

		// The summary object is still the only thing on stdout, and carries the failure
		// with its skin/animation/path identity and a serialized error.
		const result = JSON.parse((error as { stdout: string }).stdout) as {
			failed: {
				animationName: string;
				error: { code?: string; message: string; name: string };
				outputPath: string;
				skinName?: string;
			}[];
			succeeded: { animationName: string }[];
		};

		expect(result.succeeded.map((entry) => entry.animationName).sort()).toEqual([
			"hover",
			"press",
		]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]).toMatchObject({
			animationName: "idle",
			outputPath: path.join(outputDir, "alt", "idle.apng"),
			skinName: "alt",
		});
		expect(typeof result.failed[0]?.error.name).toBe("string");
		expect((result.failed[0]?.error.message ?? "").length).toBeGreaterThan(0);

		// JSON mode suppresses the human "Failed ..." stderr chatter.
		expect((error as { stderr?: string }).stderr ?? "").not.toContain("Failed alt/idle");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});
