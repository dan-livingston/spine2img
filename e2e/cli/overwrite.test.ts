import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import { decodeApng, fixtureSkeletonPath, runCli } from "../helpers.ts";

test("built package CLI protects existing outputs unless --overwrite is passed", async () => {
	const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-cli-overwrite-"));

	try {
		const outputPath = path.join(tempDirectory, "cli-overwrite.apng");
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
		expect((error as { stderr?: string }).stderr).toContain("Pass --overwrite to replace it.");
		expect(await readFile(outputPath)).toEqual(originalBytes);

		const { stdout } = await runCli(["render", fixtureSkeletonPath, outputPath, "--overwrite"]);
		const decoded = decodeApng(await readFile(outputPath));

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
