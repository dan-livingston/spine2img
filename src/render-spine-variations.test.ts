import type {
	Bounds,
	LoadedAssets,
	RendererBackend,
	RenderVariation,
	ResolvedVariation,
	Sample,
	SkeletonDescription,
	VariationSelection,
	Viewport,
} from "#/lib/renderer-backend.ts";

import { runSpineVariations } from "#/render-spine-variations.ts";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

// A faulting in-memory backend: it answers every seam call cheaply (1×1 frames the
// real APNG encoder can encode) but throws on demand for chosen variations, so the
// orchestrator's collected-failure path can be exercised deterministically without
// a fixture that genuinely fails.
interface FakeHandle {
	animationNames: string[];
	skinNames: string[];
}

interface FakeBackendOptions {
	animationNames: string[];
	failMeasure?: (variation: RenderVariation) => boolean;
	failRender?: (variation: RenderVariation) => boolean;
	skinNames: string[];
}

const UNIT_BOUNDS: Bounds = { height: 1, maxX: 1, maxY: 1, minX: 0, minY: 0, width: 1 };

function createFakeBackend(options: FakeBackendOptions): RendererBackend<FakeHandle> {
	return {
		describeSkeleton(assets: LoadedAssets<FakeHandle>): SkeletonDescription {
			return {
				animationNames: assets.handle.animationNames,
				skinNames: assets.handle.skinNames,
			};
		},
		disposeAssets(): void {},
		loadAssets(): Promise<LoadedAssets<FakeHandle>> {
			return Promise.resolve({
				handle: { animationNames: options.animationNames, skinNames: options.skinNames },
			});
		},
		measureBounds(_assets, variation: RenderVariation): Bounds {
			if (options.failMeasure?.(variation)) {
				throw new Error(`measure failed for ${variation.animationName}`);
			}

			return UNIT_BOUNDS;
		},
		renderFrames(
			_assets,
			variation: RenderVariation,
			samples: Sample[],
			_bounds,
			viewport: Viewport,
		) {
			if (options.failRender?.(variation)) {
				throw new Error(`render failed for ${variation.animationName}`);
			}

			return samples.map(() => new ArrayBuffer(viewport.width * viewport.height * 4));
		},
		resolveVariation(_assets, selection: VariationSelection): ResolvedVariation {
			return {
				animationDurationSeconds: 0,
				animationName: selection.animationName ?? "",
				skinName: selection.skinName,
			};
		},
	};
}

test("runSpineVariations collects a single render failure and keeps rendering the rest", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-unit-partial-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const result = await runSpineVariations(
			createFakeBackend({
				animationNames: ["idle", "boom", "press"],
				failRender: (variation) => variation.animationName === "boom",
				skinNames: [],
			}),
			{ outputDir, skeletonPath: "/fake/skeleton.json" },
		);

		// The run continued past the faulting variation: the two healthy variations
		// rendered, only "boom" was collected.
		expect(result.succeeded.map((entry) => entry.animationName).sort()).toEqual([
			"idle",
			"press",
		]);
		expect(result.failed).toHaveLength(1);
		expect(result.failed[0]).toMatchObject({
			animationName: "boom",
			outputPath: path.join(outputDir, "boom.apng"),
		});
		expect(result.failed[0]?.error.message).toBe("render failed for boom");

		// The failure left no file behind; the successes did.
		expect((await readdir(outputDir)).sort()).toEqual(["idle.apng", "press.apng"]);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("runSpineVariations isolates a skin's measure failure to that skin", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-unit-measure-"));

	try {
		const outputDir = path.join(tempDirectory, "out");
		const result = await runSpineVariations(
			createFakeBackend({
				animationNames: ["idle", "hover"],
				failMeasure: (variation) => variation.skinName === "b",
				skinNames: ["a", "b"],
			}),
			{ outputDir, skeletonPath: "/fake/skeleton.json" },
		);

		// Skin "a" measured and rendered both animations; skin "b"'s measure pass
		// failed, so both of its variations were collected — without aborting "a".
		expect(
			result.succeeded.map((entry) => `${entry.skinName}/${entry.animationName}`).sort(),
		).toEqual(["a/hover", "a/idle"]);
		expect(
			result.failed.map((entry) => `${entry.skinName}/${entry.animationName}`).sort(),
		).toEqual(["b/hover", "b/idle"]);
		// A fully-failed skin still reports as a targeted skin.
		expect(result.skinNames).toEqual(["a", "b"]);
		expect(await readdir(outputDir)).toEqual(["a"]);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});
