#!/usr/bin/env node

import { runCli } from "#/cli.ts";

import { formatRenderErrorForCli } from "./lib/errors.ts";

await runCli(process.argv).catch((error: unknown) => {
	console.error(formatRenderErrorForCli(error));
	process.exitCode = 1;
});
