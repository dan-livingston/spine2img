import type { OutputFormat } from "#/lib/output-format.ts";

import path from "node:path";

// A bare `.webp` (no stem) is a dotfile, not an extension: `path.extname(".webp")`
// returns "", so the runtime treats it as APNG. Requiring a non-empty stem keeps the
// inferred type in step with that. Every non-WebP path — `.png`, `.apng`, unrecognized
// extensions, extensionless — falls through to the APNG default.
type InferredOutputFormat<TOutputPath extends string> = string extends TOutputPath
	? OutputFormat
	: Lowercase<TOutputPath> extends `${infer TStem}.webp`
		? TStem extends ""
			? "apng"
			: "webp"
		: "apng";

export type ResolvedOutputFormat<
	TOutputPath extends string,
	TExplicitFormat extends OutputFormat | undefined = undefined,
> = TExplicitFormat extends OutputFormat ? TExplicitFormat : InferredOutputFormat<TOutputPath>;

export function resolveFormat<
	TOutputPath extends string,
	TExplicitFormat extends OutputFormat | undefined,
>(options: {
	format?: TExplicitFormat;
	outputPath: TOutputPath;
}): ResolvedOutputFormat<TOutputPath, TExplicitFormat> {
	if (options.format) {
		return options.format as ResolvedOutputFormat<TOutputPath, TExplicitFormat>;
	}

	const extension = path.extname(options.outputPath).toLowerCase();

	if (extension === ".webp") {
		return "webp" as ResolvedOutputFormat<TOutputPath, TExplicitFormat>;
	}

	return "apng" as ResolvedOutputFormat<TOutputPath, TExplicitFormat>;
}
