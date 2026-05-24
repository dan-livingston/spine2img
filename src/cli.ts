import type { RenderSpineVariationsResult } from "#/render-spine-variations.ts";

import { serializeRenderErrorForJson } from "#/lib/errors.ts";
import { renderSpineVariations } from "#/render-spine-variations.ts";
import { renderSpine } from "#/render-spine.ts";
import { Command, InvalidArgumentError } from "commander";

function parseOutputFormat(value: string): "apng" | "webp" {
	if (value === "apng" || value === "webp") {
		return value;
	}

	throw new InvalidArgumentError(`format must be "apng" or "webp". Received ${value}.`);
}

// Accumulates a repeatable flag (`--skin`, `--loop-once`, `--loop-infinite`) into an
// array.
function collect(value: string, previous: string[]): string[] {
	return [...previous, value];
}

export function createCli(): Command {
	const program = new Command();

	program
		.name("spine2img")
		.description("Render Spine JSON animations to APNG or WebP.")
		.addCommand(
			new Command("render")
				.description("Render a Spine skeleton to an animated image file.")
				.argument("<skeleton>", "path to the Spine JSON skeleton")
				.argument("<output>", "path for the output image file")
				.option(
					"--atlas <atlas>",
					"path to the Spine atlas (defaults beside the skeleton; relative paths resolve from the current directory)",
				)
				.option("--animation <animation>", "exact animation name to render")
				.option(
					"--format <format>",
					"output format override (otherwise inferred from the output extension)",
					parseOutputFormat,
				)
				.option("--width <width>", "output width in pixels", Number)
				.option("--height <height>", "output height in pixels", Number)
				.option(
					"--background <color>",
					"solid background hex color (#rgb, #rgba, #rrggbb, or #rrggbbaa)",
				)
				.option("--fps <fps>", "frames per second", Number)
				.option("--loop <count>", "loop count to embed (0 = infinite, the default)", Number)
				.option("--no-lossless", "opt into lossy WebP output")
				.option("--quality <quality>", "lossy WebP quality from 0 to 100", Number)
				.option("--json", "print structured result metadata as JSON")
				.option("--overwrite", "overwrite an existing output file")
				.option("--skin <skin>", "exact skin name to apply")
				.action(async (skeleton, output, options) => {
					const result = await renderSpine({
						skeletonPath: skeleton,
						outputPath: output,
						atlasPath: options.atlas,
						animationName: options.animation,
						skinName: options.skin,
						backgroundColor: options.background,
						fps: options.fps,
						format: options.format,
						height: options.height,
						loop: options.loop,
						lossless: options.lossless,
						overwrite: options.overwrite,
						quality: options.quality,
						width: options.width,
					});

					if (options.json) {
						console.log(JSON.stringify(result));
						return;
					}

					console.log(
						`Rendered ${result.animationName} to ${result.outputPath} (${result.width}x${result.height}, ${result.frameCount} frames @ ${result.fps} fps).`,
					);
				}),
		)
		.addCommand(
			new Command("render-all")
				.description(
					"Render every animation across a Spine skeleton's skins to a directory.",
				)
				.argument("<skeleton>", "path to the Spine JSON skeleton")
				.argument("<outDir>", "directory for the rendered image files")
				.option(
					"--atlas <atlas>",
					"path to the Spine atlas (defaults beside the skeleton; relative paths resolve from the current directory)",
				)
				.option(
					"--format <format>",
					"output format for every file (apng or webp); defaults to apng",
					parseOutputFormat,
				)
				.option(
					"--skin <skin>",
					"render only this skin (repeatable); defaults to every named skin",
					collect,
					[],
				)
				.option(
					"--tight",
					"auto-fit each animation to its own bounds instead of a uniform per-skin canvas",
				)
				.option(
					"--width <width>",
					"force the output width in pixels for every variation",
					Number,
				)
				.option(
					"--height <height>",
					"force the output height in pixels for every variation",
					Number,
				)
				.option(
					"--background <color>",
					"solid background hex color (#rgb, #rgba, #rrggbb, or #rrggbbaa)",
				)
				.option("--fps <fps>", "frames per second", Number)
				.option(
					"--loop <count>",
					"default loop count for every file (0 = infinite, the default)",
					Number,
				)
				.option(
					"--loop-once <glob>",
					"glob of animation names to play once (loop count 1; repeatable)",
					collect,
					[],
				)
				.option(
					"--loop-infinite <glob>",
					"glob of animation names to loop forever (loop count 0; repeatable)",
					collect,
					[],
				)
				.option("--no-lossless", "opt into lossy WebP output")
				.option("--quality <quality>", "lossy WebP quality from 0 to 100", Number)
				.option(
					"--json",
					"print the structured run summary as JSON instead of streaming progress",
				)
				.option("--overwrite", "replace existing output files")
				.action(async (skeleton, outDir, options) => {
					const json = Boolean(options.json);
					const result = await renderSpineVariations({
						skeletonPath: skeleton,
						outputDir: outDir,
						atlasPath: options.atlas,
						backgroundColor: options.background,
						format: options.format,
						fps: options.fps,
						height: options.height,
						// Thin desugaring onto the library policy: `--loop` is the
						// default, `--loop-once`/`--loop-infinite` the binary overrides.
						loop: {
							default: options.loop,
							infinite: options.loopInfinite,
							once: options.loopOnce,
						},
						lossless: options.lossless,
						overwrite: options.overwrite,
						quality: options.quality,
						skinNames: options.skin,
						tight: options.tight,
						width: options.width,
						onProgress: (variation) => {
							if (json) {
								return;
							}

							console.log(
								`Rendered ${formatVariationLabel(variation)} to ${variation.outputPath} (${variation.width}x${variation.height}, ${variation.frameCount} frames @ ${variation.fps} fps).`,
							);
						},
					});
					const failed = result.failed.length;

					if (json) {
						console.log(JSON.stringify(serializeVariationsResult(result)));
					} else {
						const succeeded = result.succeeded.length;

						for (const failure of result.failed) {
							console.error(
								`Failed ${formatVariationLabel(failure)}: ${failure.error.message}`,
							);
						}

						console.log(
							`Rendered ${succeeded} variation${succeeded === 1 ? "" : "s"} to ${result.outputDir}${
								failed > 0 ? ` (${failed} failed)` : ""
							}.`,
						);
					}

					// Any collected per-variation failure makes the run exit non-zero, so
					// CI detects a partial batch without parsing output.
					if (failed > 0) {
						process.exitCode = 1;
					}
				}),
		);

	return program;
}

function serializeVariationsResult(result: RenderSpineVariationsResult) {
	return {
		...result,
		failed: result.failed.map((failure) => ({
			animationName: failure.animationName,
			error: serializeRenderErrorForJson(failure.error),
			outputPath: failure.outputPath,
			skinName: failure.skinName,
		})),
	};
}

function formatVariationLabel(variation: { animationName: string; skinName?: string }): string {
	return variation.skinName
		? `${variation.skinName}/${variation.animationName}`
		: variation.animationName;
}

export async function runCli(argv = process.argv): Promise<void> {
	await createCli().parseAsync(argv);
}
