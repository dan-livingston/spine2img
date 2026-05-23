import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import { createSelectableFixture, fixtureDirectory, runCli } from "../helpers.ts";

test("packed package CLI prints friendly typed input errors", async () => {
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
				path.join(tempDirectory, "cli-error.apng"),
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

test("packed package CLI prints friendly animation lookup errors", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-animation-error-"));

	try {
		const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);

		let error: unknown;

		try {
			await runCli([
				"render",
				path.join(fixtureCopyDirectory, "box.json"),
				path.join(tempDirectory, "cli-animation-error.apng"),
				"--animation",
				"missing",
			]);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { stderr?: string }).stderr).toContain('Unknown animation "missing"');
		expect((error as { stderr?: string }).stderr).toContain(
			"Available animations: pulse, pulse-short.",
		);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI prints friendly skin lookup errors", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-skin-error-"));

	try {
		const fixtureCopyDirectory = await createSelectableFixture(tempDirectory);

		let error: unknown;

		try {
			await runCli([
				"render",
				path.join(fixtureCopyDirectory, "box.json"),
				path.join(tempDirectory, "cli-skin-error.apng"),
				"--skin",
				"missing",
			]);
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(Error);
		expect((error as { stderr?: string }).stderr).toContain('Unknown skin "missing"');
		expect((error as { stderr?: string }).stderr).toContain("Available skins: default, alt.");
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
});

test("packed package CLI reports (none) when the skeleton defines no skins", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-no-skins-"));

	try {
		const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
		const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
		await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
		const skeleton = JSON.parse(await readFile(skeletonPath, "utf8")) as { skins: unknown[] };
		skeleton.skins = [];
		await writeFile(skeletonPath, `${JSON.stringify(skeleton, null, "\t")}\n`);

		let error: unknown;

		try {
			await runCli([
				"render",
				skeletonPath,
				path.join(tempDirectory, "cli-no-skins.apng"),
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
