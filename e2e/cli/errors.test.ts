import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vite-plus/test";

import {
	animatedFormatCases,
	createSelectableFixture,
	fixtureDirectory,
	fixtureSkeletonPath,
	runCli,
} from "../helpers.ts";

describe.each(animatedFormatCases)(
	"packed package CLI reports format-agnostic errors for $format output",
	({ extension }) => {
		test("prints friendly typed input errors", async () => {
			const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-error-"));

			try {
				const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
				await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
				await rm(path.join(fixtureCopyDirectory, "box.atlas"));

				let error: unknown;

				try {
					await runCli([
						"render",
						path.join(fixtureCopyDirectory, "box.json"),
						path.join(tempDirectory, `cli-error.${extension}`),
					]);
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(Error);
				expect((error as { stderr?: string }).stderr).toContain("Missing atlas input:");
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});

		test("prints friendly animation lookup errors", async () => {
			const tempDirectory = await mkdtemp(
				path.join(os.tmpdir(), "spine2img-cli-animation-error-"),
			);

			try {
				const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);

				let error: unknown;

				try {
					await runCli([
						"render",
						path.join(fixtureCopyDirectory, "box.json"),
						path.join(tempDirectory, `cli-animation-error.${extension}`),
						"--animation",
						"missing",
					]);
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(Error);
				expect((error as { stderr?: string }).stderr).toContain(
					'Unknown animation "missing"',
				);
				expect((error as { stderr?: string }).stderr).toContain(
					"Available animations: pulse, pulse-short.",
				);
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});

		test("prints friendly skin lookup errors", async () => {
			const tempDirectory = await mkdtemp(
				path.join(os.tmpdir(), "spine2img-cli-skin-error-"),
			);

			try {
				const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);

				let error: unknown;

				try {
					await runCli([
						"render",
						path.join(fixtureCopyDirectory, "box.json"),
						path.join(tempDirectory, `cli-skin-error.${extension}`),
						"--skin",
						"missing",
					]);
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(Error);
				expect((error as { stderr?: string }).stderr).toContain('Unknown skin "missing"');
				expect((error as { stderr?: string }).stderr).toContain(
					"Available skins: default, alt.",
				);
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});

		test("reports (none) when the skeleton defines no skins", async () => {
			const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-no-skins-"));

			try {
				const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
				const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
				await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
				const skeleton = JSON.parse(await readFile(skeletonPath, "utf8")) as {
					skins: unknown[];
				};
				skeleton.skins = [];
				await writeFile(skeletonPath, `${JSON.stringify(skeleton, null, "\t")}\n`);

				let error: unknown;

				try {
					await runCli([
						"render",
						skeletonPath,
						path.join(tempDirectory, `cli-no-skins.${extension}`),
						"--skin",
						"missing",
					]);
				} catch (caught) {
					error = caught;
				}

				expect(error).toBeInstanceOf(Error);
				expect((error as { stderr?: string }).stderr).toContain("Available skins: (none).");
			} finally {
				await rm(tempDirectory, { force: true, recursive: true });
			}
		});
	},
);

test("packed package CLI prints friendly encode validation errors", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-encode-error-"));
	const cases = [
		{
			args: [
				"render",
				fixtureSkeletonPath,
				path.join(tempDirectory, "lossy.apng"),
				"--no-lossless",
			],
			message: "lossless: false is only supported for WebP output.",
		},
		{
			args: [
				"render",
				fixtureSkeletonPath,
				path.join(tempDirectory, "quality.apng"),
				"--quality",
				"80",
			],
			message: "quality is only supported for lossy WebP output.",
		},
		{
			args: [
				"render",
				fixtureSkeletonPath,
				path.join(tempDirectory, "quality.webp"),
				"--quality",
				"80",
			],
			message: "quality is only supported for lossy WebP output.",
		},
		{
			args: [
				"render",
				fixtureSkeletonPath,
				path.join(tempDirectory, "invalid-quality.webp"),
				"--no-lossless",
				"--quality",
				"200",
			],
			message: "quality must be a number between 0 and 100. Received 200.",
		},
	];

	try {
		for (const testCase of cases) {
			let error: unknown;

			try {
				await runCli(testCase.args);
			} catch (caught) {
				error = caught;
			}

			expect(error).toBeInstanceOf(Error);
			expect((error as { code?: number }).code).not.toBe(0);
			expect((error as { stderr?: string }).stderr).toContain(testCase.message);
		}
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});
