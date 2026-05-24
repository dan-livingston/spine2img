import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import { decodeApng, importPackageApi, renderAllFixtureSkeletonPath } from "../helpers.ts";

test("packed package API renders the animations × named-skins cross-product", async () => {
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
		// The base `default` skin is excluded when named skins exist; both named
		// skins render, in skeleton-declared order.
		expect(result.skinNames).toEqual(["alt", "wide"]);
		expect(result.failed).toEqual([]);
		expect(result.durationMs).toBeGreaterThanOrEqual(0);

		// Three animations per named skin, each carrying the single-render shape.
		expect(result.succeeded).toHaveLength(6);
		expect(
			result.succeeded.every(
				(entry) => entry.format === "apng" && entry.skinName !== "default",
			),
		).toBe(true);
		for (const skinName of ["alt", "wide"]) {
			expect(
				result.succeeded
					.filter((entry) => entry.skinName === skinName)
					.map((entry) => entry.animationName)
					.sort(),
			).toEqual(["hover", "idle", "press"]);
		}

		// Files group under one directory per rendered skin; no `default/`.
		expect((await readdir(outputDir)).sort()).toEqual(["alt", "wide"]);

		const altIdle = result.succeeded.find(
			(entry) => entry.skinName === "alt" && entry.animationName === "idle",
		);
		expect(altIdle?.outputPath).toBe(path.join(outputDir, "alt", "idle.apng"));

		const decoded = decodeApng(await readFile(altIdle?.outputPath ?? ""));
		expect(decoded.frameCount).toBe(altIdle?.frameCount);

		// The two skins swap in differently-sized boxes, so the same animation must
		// render at different widths — proof the skin axis actually applied.
		const wideIdle = result.succeeded.find(
			(entry) => entry.skinName === "wide" && entry.animationName === "idle",
		);
		expect(altIdle?.width).toBeLessThan(wideIdle?.width ?? 0);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API narrows the run to a requested skin subset", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-render-all-subset-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineVariations({
			outputDir,
			skeletonPath: renderAllFixtureSkeletonPath,
			skinNames: ["wide"],
		});

		expect(result.skinNames).toEqual(["wide"]);
		expect(result.succeeded).toHaveLength(3);
		expect(await readdir(outputDir)).toEqual(["wide"]);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API forces the default skin when it is requested explicitly", async () => {
	const tempDirectory = await mkdtemp(
		path.join(os.tmpdir(), "spine2img-api-render-all-default-"),
	);

	try {
		const outputDir = path.join(tempDirectory, "out");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineVariations({
			outputDir,
			skeletonPath: renderAllFixtureSkeletonPath,
			skinNames: ["default"],
		});

		expect(result.skinNames).toEqual(["default"]);
		expect(result.succeeded).toHaveLength(3);
		expect(await readdir(outputDir)).toEqual(["default"]);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API registers every animation in a skin on one uniform canvas", async () => {
	const tempDirectory = await mkdtemp(
		path.join(os.tmpdir(), "spine2img-api-render-all-registered-"),
	);

	try {
		const outputDir = path.join(tempDirectory, "out");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineVariations({
			outputDir,
			skeletonPath: renderAllFixtureSkeletonPath,
		});

		// The fixture's three animations move the box by different amounts, so a
		// registered skin collapses them onto one shared canvas size.
		for (const skinName of ["alt", "wide"]) {
			const dimensions = result.succeeded
				.filter((entry) => entry.skinName === skinName)
				.map((entry) => `${entry.width}x${entry.height}`);

			expect(dimensions).toHaveLength(3);
			expect(new Set(dimensions).size).toBe(1);
		}

		// The registered size is also what lands on disk.
		const altIdle = result.succeeded.find(
			(entry) => entry.skinName === "alt" && entry.animationName === "idle",
		);
		const decoded = decodeApng(await readFile(altIdle?.outputPath ?? ""));
		expect(decoded.width).toBe(altIdle?.width);
		expect(decoded.height).toBe(altIdle?.height);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API --tight auto-fits each animation to its own bounds", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-render-all-tight-"));

	try {
		const packageApi = await importPackageApi();
		const registered = await packageApi.renderSpineVariations({
			outputDir: path.join(tempDirectory, "registered"),
			skeletonPath: renderAllFixtureSkeletonPath,
			skinNames: ["alt"],
		});
		const tight = await packageApi.renderSpineVariations({
			outputDir: path.join(tempDirectory, "tight"),
			skeletonPath: renderAllFixtureSkeletonPath,
			skinNames: ["alt"],
			tight: true,
		});

		const registeredDimensions = new Set(
			registered.succeeded.map((entry) => `${entry.width}x${entry.height}`),
		);
		const tightDimensions = new Set(
			tight.succeeded.map((entry) => `${entry.width}x${entry.height}`),
		);

		// Registration collapses the skin to one size; --tight keeps each animation's
		// own crop, so the three animations differ.
		expect(registeredDimensions.size).toBe(1);
		expect(tightDimensions.size).toBeGreaterThan(1);

		// The registered canvas is the union of the tight crops, so it is never
		// smaller than any individual animation.
		for (const tightEntry of tight.succeeded) {
			const registeredEntry = registered.succeeded.find(
				(entry) => entry.animationName === tightEntry.animationName,
			);

			expect(registeredEntry?.width).toBeGreaterThanOrEqual(tightEntry.width);
			expect(registeredEntry?.height).toBeGreaterThanOrEqual(tightEntry.height);
		}
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API forces a uniform canvas with explicit width and height", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-render-all-size-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const packageApi = await importPackageApi();
		const result = await packageApi.renderSpineVariations({
			height: 90,
			outputDir,
			skeletonPath: renderAllFixtureSkeletonPath,
			width: 120,
		});

		// Explicit dimensions override sizing uniformly across every skin and
		// animation, not just one variation.
		expect(result.succeeded).toHaveLength(6);
		expect(result.succeeded.every((entry) => entry.width === 120 && entry.height === 90)).toBe(
			true,
		);

		const sample = result.succeeded[0];
		const decoded = decodeApng(await readFile(sample?.outputPath ?? ""));
		expect(decoded.width).toBe(120);
		expect(decoded.height).toBe(90);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package API fails fast with a typed error for an unknown skin", async () => {
	const tempDirectory = await mkdtemp(
		path.join(os.tmpdir(), "spine2img-api-render-all-unknown-"),
	);

	try {
		const outputDir = path.join(tempDirectory, "out");
		const packageApi = await importPackageApi();

		let error: unknown;

		try {
			await packageApi.renderSpineVariations({
				outputDir,
				skeletonPath: renderAllFixtureSkeletonPath,
				skinNames: ["missing"],
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.SpineSelectionError);
		expect(error).toMatchObject({
			availableNames: ["default", "alt", "wide"],
			code: "missing-selection",
			requestedName: "missing",
			selectionType: "skin",
		});

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
