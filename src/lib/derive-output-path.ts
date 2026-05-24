import type { OutputFormat } from "#/lib/output-format.ts";

import path from "node:path";

const FORMAT_EXTENSIONS: { [K in OutputFormat]: string } = {
	apng: "apng",
	webp: "webp",
};

export interface DeriveOutputPathInput {
	animationName: string;
	format: OutputFormat;
	outputDir: string;
	skinName?: string;
}

// Maps a variation to its target path under the run's output directory:
// `<outputDir>/<skin>/<animation>.<ext>`. A skinless variation (no `skinName`)
// degenerates to a flat `<outputDir>/<animation>.<ext>` with no skin segment.
// The `..`/absolute escape guard and slash-as-nested-directories handling arrive
// with the failure/hygiene slice; the tracer-bullet fixtures carry neither.
export function deriveOutputPath(input: DeriveOutputPathInput): string {
	const fileName = `${input.animationName}.${FORMAT_EXTENSIONS[input.format]}`;

	return input.skinName === undefined
		? path.join(input.outputDir, fileName)
		: path.join(input.outputDir, input.skinName, fileName);
}
