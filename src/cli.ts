import type { RenderSpineResult } from "#/render-spine.ts";

import { renderSpineVariations } from "#/render-spine-variations.ts";
import { renderSpine } from "#/render-spine.ts";
import { Command, InvalidArgumentError } from "commander";

function parseOutputFormat(value: string): "apng" | "webp" {
	if (value === "apng" || value === "webp") {
		return value;
	}

	throw new InvalidArgumentError(`format must be "apng" or "webp". Received ${value}.`);
}

// Accumulates a repeatable `--skin` flag into an array.
function collectSkin(value: string, previous: string[]): string[] {
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
					collectSkin,
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
				.option("--no-lossless", "opt into lossy WebP output")
				.option("--quality <quality>", "lossy WebP quality from 0 to 100", Number)
				.action(async (skeleton, outDir, options) => {
					const result = await renderSpineVariations({
						skeletonPath: skeleton,
						outputDir: outDir,
						atlasPath: options.atlas,
						backgroundColor: options.background,
						format: options.format,
						fps: options.fps,
						height: options.height,
						lossless: options.lossless,
						quality: options.quality,
						skinNames: options.skin,
						tight: options.tight,
						width: options.width,
						onProgress: (variation) => {
							console.log(
								`Rendered ${formatVariationLabel(variation)} to ${variation.outputPath} (${variation.width}x${variation.height}, ${variation.frameCount} frames @ ${variation.fps} fps).`,
							);
						},
					});
					const count = result.succeeded.length;

					console.log(
						`Rendered ${count} variation${count === 1 ? "" : "s"} to ${result.outputDir}.`,
					);
				}),
		);

	return program;
}

function formatVariationLabel(result: RenderSpineResult): string {
	return result.skinName ? `${result.skinName}/${result.animationName}` : result.animationName;
}

export async function runCli(argv = process.argv): Promise<void> {
	await createCli().parseAsync(argv);
}
