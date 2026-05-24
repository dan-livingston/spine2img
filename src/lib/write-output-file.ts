import { OutputCollisionError } from "#/lib/errors.ts";
import { isNodeErrorWithCode } from "#/lib/node-errors.ts";
import { writeFile } from "node:fs/promises";

// Writes encoded bytes to `outputPath`. With `overwrite` off the `wx` flag guards the
// narrow race window between any upfront collision gate and the write: a file that
// appears in that window surfaces as a typed `OutputCollisionError` instead of a raw
// `EEXIST`, so single-render and batch report the same typed failure for a collision.
export async function writeOutputFile(
	outputPath: string,
	encoded: Uint8Array,
	overwrite: boolean,
): Promise<void> {
	try {
		await writeFile(outputPath, encoded, { flag: overwrite ? "w" : "wx" });
	} catch (error) {
		if (isNodeErrorWithCode(error, "EEXIST")) {
			throw new OutputCollisionError({
				cause: error,
				code: "existing-output",
				message: `Output already exists at ${outputPath}.`,
				outputPath,
			});
		}

		throw error;
	}
}
