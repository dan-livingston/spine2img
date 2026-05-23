import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import { animatedFormatCases, fixtureDirectory, importPackageApi } from "../helpers.ts";

describe.each(animatedFormatCases)(
	"packed package API input resolution stays format-agnostic for $format output",
	({ extension }) => {
		test("throws typed errors for missing default atlas input", async () => {
			const tempDirectory = await mkdtemp(
				path.join(os.tmpdir(), "spine2img-api-missing-atlas-"),
			);

			try {
				const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
				await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
				await rm(path.join(fixtureCopyDirectory, "box.atlas"));

				const packageApi = await importPackageApi();

				let error: unknown;

				try {
					await packageApi.renderSpine({
						outputPath: path.join(tempDirectory, `missing.${extension}`),
						skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
					});
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(packageApi.SpineInputResolutionError);
				expect(error).toMatchObject({
					assetType: "atlas",
					code: "missing-asset",
				});
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});

		test("throws typed errors for inconsistent skeleton and atlas inputs", async () => {
			const tempDirectory = await mkdtemp(
				path.join(os.tmpdir(), "spine2img-api-inconsistent-"),
			);

			try {
				const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
				const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
				await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
				await writeFile(
					skeletonPath,
					(await readFile(skeletonPath, "utf8")).replace(
						'"path": "box"',
						'"path": "missing"',
					),
				);

				const packageApi = await importPackageApi();

				let error: unknown;

				try {
					await packageApi.renderSpine({
						outputPath: path.join(tempDirectory, `inconsistent.${extension}`),
						skeletonPath,
					});
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(packageApi.SpineInputResolutionError);
				expect(error).toMatchObject({
					assetType: "bundle",
					code: "inconsistent-assets",
				});
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});

		test("throws typed errors for a missing texture referenced by the atlas", async () => {
			const tempDirectory = await mkdtemp(
				path.join(os.tmpdir(), "spine2img-api-missing-texture-"),
			);

			try {
				const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
				await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
				await rm(path.join(fixtureCopyDirectory, "box.png"));

				const packageApi = await importPackageApi();

				let error: unknown;

				try {
					await packageApi.renderSpine({
						outputPath: path.join(tempDirectory, `missing-texture.${extension}`),
						skeletonPath: path.join(fixtureCopyDirectory, "box.json"),
					});
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(packageApi.SpineInputResolutionError);
				expect(error).toMatchObject({
					assetType: "texture",
					code: "missing-asset",
				});
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});

		test("throws typed errors for malformed skeleton JSON", async () => {
			const tempDirectory = await mkdtemp(
				path.join(os.tmpdir(), "spine2img-api-invalid-skeleton-"),
			);

			try {
				const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
				const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
				await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
				await writeFile(skeletonPath, "{ not valid json");

				const packageApi = await importPackageApi();

				let error: unknown;

				try {
					await packageApi.renderSpine({
						outputPath: path.join(tempDirectory, `invalid-skeleton.${extension}`),
						skeletonPath,
					});
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(packageApi.SpineInputResolutionError);
				expect(error).toMatchObject({
					assetType: "skeleton",
					code: "invalid-asset",
				});
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});
	},
);
