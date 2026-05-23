import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import {
	animatedFormatCases,
	createSelectableFixture,
	decodeAnimation,
	importPackageApi,
} from "../helpers.ts";

describe.each(animatedFormatCases)(
	"packed package API selection uses $format output",
	({ extension, format }) => {
		test("renders a selected animation and skin", async () => {
			const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-selection-"));

			try {
				const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);
				const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
				const altOutputPath = path.join(tempDirectory, `selected-alt.${extension}`);
				const defaultOutputPath = path.join(tempDirectory, `selected-default.${extension}`);
				const packageApi = await importPackageApi();
				const altResult = await packageApi.renderSpine({
					animationName: "pulse-short",
					outputPath: altOutputPath,
					skeletonPath,
					skinName: "alt",
				});
				const defaultResult = await packageApi.renderSpine({
					animationName: "pulse-short",
					outputPath: defaultOutputPath,
					skeletonPath,
				});
				const decodedAlt = await decodeAnimation(await readFile(altOutputPath), format);

				expect(altResult).toMatchObject({
					animationName: "pulse-short",
					format,
					frameCount: 15,
					skinName: "alt",
				});
				expect(defaultResult).toMatchObject({
					format,
				});
				expect(defaultResult.skinName).toBeUndefined();
				// The alt skin swaps in a smaller box, so selecting it must shrink the
				// rendered bounds relative to the default skin.
				expect(altResult.width).toBeLessThan(defaultResult.width);
				expect(altResult.height).toBeLessThan(defaultResult.height);
				// Only height/width are asserted against the decoded artifact here.
				// Frame count is intentionally omitted: the symmetric pulse-short
				// animation produces an identical adjacent frame, which libwebp
				// losslessly coalesces (one doubled delay), so the decoded WebP page
				// count is below the reported frameCount. Decoded frame-count fidelity
				// is covered per-format in the render spec.
				expect(decodedAlt.height).toBe(altResult.height);
				expect(decodedAlt.width).toBe(altResult.width);
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});

		test("throws typed errors for missing animation selections", async () => {
			const tempDirectory = await mkdtemp(
				path.join(os.tmpdir(), "spine2img-api-animation-error-"),
			);

			try {
				const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);
				const packageApi = await importPackageApi();

				let error: unknown;

				try {
					await packageApi.renderSpine({
						animationName: "missing",
						outputPath: path.join(tempDirectory, `missing-animation.${extension}`),
						skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
					});
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(packageApi.SpineSelectionError);
				expect(error).toMatchObject({
					availableNames: ["pulse", "pulse-short"],
					code: "missing-selection",
					requestedName: "missing",
					selectionType: "animation",
				});
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});

		test("throws typed errors for missing skin selections", async () => {
			const tempDirectory = await mkdtemp(
				path.join(os.tmpdir(), "spine2img-api-skin-error-"),
			);

			try {
				const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);
				const packageApi = await importPackageApi();

				let error: unknown;

				try {
					await packageApi.renderSpine({
						outputPath: path.join(tempDirectory, `missing-skin.${extension}`),
						skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
						skinName: "missing",
					});
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(packageApi.SpineSelectionError);
				expect(error).toMatchObject({
					availableNames: ["default", "alt"],
					code: "missing-selection",
					requestedName: "missing",
					selectionType: "skin",
				});
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});
	},
);
