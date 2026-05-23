import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import { animatedFormatCases, decodeAnimation, fixtureSkeletonPath, runCli } from "../helpers.ts";

describe.each(animatedFormatCases)(
	"packed package CLI protects $format outputs unless --overwrite is passed",
	({ extension, format }) => {
		test("existing outputs stay untouched until overwrite is requested", async () => {
			const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-overwrite-"));

			try {
				const outputPath = path.join(tempDirectory, `cli-overwrite.${extension}`);
				const originalBytes = Buffer.from("do-not-clobber");
				await writeFile(outputPath, originalBytes);

				let error: unknown;

				try {
					await runCli(["render", fixtureSkeletonPath, outputPath]);
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(Error);
				expect((error as { stderr?: string }).stderr).toContain("Output already exists:");
				expect((error as { stderr?: string }).stderr).toContain(
					"Pass --overwrite to replace it.",
				);
				expect(await readFile(outputPath)).toEqual(originalBytes);

				const { stdout } = await runCli([
					"render",
					fixtureSkeletonPath,
					outputPath,
					"--overwrite",
				]);
				const decoded = await decodeAnimation(await readFile(outputPath), format);

				expect(stdout).toContain("Rendered pulse");
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
