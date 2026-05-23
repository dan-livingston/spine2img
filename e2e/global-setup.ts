import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default async function setup() {
	const rootDirectory = path.resolve(new URL("..", import.meta.url).pathname);

	await execFileAsync("pnpm", ["build"], {
		cwd: rootDirectory,
	});
}
