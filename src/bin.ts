#!/usr/bin/env node

import { runCli } from "#/cli.ts";

await runCli(process.argv).catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exitCode = 1;
});
