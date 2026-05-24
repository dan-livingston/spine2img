import type { OutputFormat } from "#/lib/output-format.ts";

// Batch format resolution. A `render-all` target is a directory, which has no
// extension to infer from, so resolution collapses to a single rung: the explicit
// `format` if given, otherwise APNG. Unlike single-render's `resolveFormat`, this
// deliberately ignores any extension on the directory path — a directory literally
// named `out.webp` is still an APNG run unless `--format webp` says otherwise.
export function resolveBatchFormat(format?: OutputFormat): OutputFormat {
	return format ?? "apng";
}
