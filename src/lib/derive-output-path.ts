import type { OutputFormat } from "#/lib/output-format.ts";

import { OutputPathError } from "#/lib/errors.ts";
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
//
// A `/` within a name is preserved as real nested directories (Spine's own grouping
// convention), but a `..` or absolute component is rejected up front so a malformed
// asset name can never write outside `<outputDir>`.
export function deriveOutputPath(input: DeriveOutputPathInput): string {
	assertSafeName(input.animationName, input.outputDir);

	if (input.skinName !== undefined) {
		assertSafeName(input.skinName, input.outputDir);
	}

	const fileName = `${input.animationName}.${FORMAT_EXTENSIONS[input.format]}`;

	return input.skinName === undefined
		? path.join(input.outputDir, fileName)
		: path.join(input.outputDir, input.skinName, fileName);
}

// Rejects any name that could escape `<outputDir>`: an absolute name, or one whose
// `/`-separated segments include a `..`. A plain `/` is left alone so it nests.
function assertSafeName(name: string, outputDir: string): void {
	const escapes = path.isAbsolute(name) || name.split("/").includes("..");

	if (escapes) {
		throw new OutputPathError({
			code: "unsafe-output-path",
			message: `Refusing to write output for "${name}": a name cannot contain ".." or absolute path segments.`,
			outputDir,
			unsafeName: name,
		});
	}
}
