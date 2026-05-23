import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import {
	animatedFormatCases,
	decodeAnimation,
	fixtureSkeletonPath,
	importPackageApi,
} from "../helpers.ts";

describe.each(animatedFormatCases)(
	"packed package API protects $format outputs unless overwrite is enabled",
	({ extension, format }) => {
		test("existing outputs stay untouched until overwrite is requested", async () => {
			const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-api-overwrite-"));

			try {
				const outputPath = path.join(tempDirectory, `api-overwrite.${extension}`);
				const originalBytes = Buffer.from("do-not-clobber");
				const packageApi = await importPackageApi();
				await writeFile(outputPath, originalBytes);

				let error: unknown;

				try {
					await packageApi.renderSpine({
						outputPath,
						skeletonPath: fixtureSkeletonPath,
					});
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(packageApi.OutputCollisionError);
				expect(error).toMatchObject({
					code: "existing-output",
					outputPath,
				});
				expect(await readFile(outputPath)).toEqual(originalBytes);

				const result = await packageApi.renderSpine({
					outputPath,
					overwrite: true,
					skeletonPath: fixtureSkeletonPath,
				});
				const decoded = await decodeAnimation(await readFile(outputPath), format);

				expect(result).toMatchObject({
					format,
					outputPath,
				});
				expect(decoded).toEqual({
					frameCount: 30,
					height: 64,
					width: 97,
				});
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});
	},
);
