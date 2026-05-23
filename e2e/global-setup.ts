import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default async function setup() {
	const rootDirectory = path.resolve(new URL("..", import.meta.url).pathname);
	const artifactDirectory = await mkdtemp(path.join(os.tmpdir(), "spine2img-package-e2e-"));
	const consumerDirectory = path.join(artifactDirectory, "consumer");
	const consumerPackageJsonPath = path.join(consumerDirectory, "package.json");

	try {
		await execFileAsync("pnpm", ["build"], {
			cwd: rootDirectory,
		});

		await mkdir(consumerDirectory, { recursive: true });
		await writeFile(
			consumerPackageJsonPath,
			`${JSON.stringify({ name: "spine2img-e2e-consumer", private: true, type: "module" }, null, "\t")}\n`,
		);
		await execFileAsync("pnpm", ["pack", "--pack-destination", artifactDirectory], {
			cwd: rootDirectory,
		});

		const tarballName = (await readdir(artifactDirectory)).find((entry) =>
			entry.endsWith(".tgz"),
		);

		if (!tarballName) {
			throw new Error(`Could not find packed artifact in ${artifactDirectory}.`);
		}

		// The tarball's transitive deps (spine-canvas, commander, sharp, upng-js) already
		// live in the workspace store, so prefer it over the network — keeps setup
		// working on offline/airgapped CI instead of failing here.
		await execFileAsync(
			"pnpm",
			[
				"add",
				"--allow-build=sharp",
				"--prefer-offline",
				path.join(artifactDirectory, tarballName),
			],
			{
				cwd: consumerDirectory,
			},
		);
	} catch (error) {
		// The temp dir is created before any of the build/pack/add steps run, so
		// clean it up if setup fails partway rather than leaking it.
		await rm(artifactDirectory, { force: true, recursive: true });
		throw error;
	}

	process.env.SPINE2IMG_E2E_CONSUMER_DIRECTORY = consumerDirectory;

	return async () => {
		delete process.env.SPINE2IMG_E2E_CONSUMER_DIRECTORY;
		await rm(artifactDirectory, { force: true, recursive: true });
	};
}
