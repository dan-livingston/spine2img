import { renderSpineToApng } from "#/render-spine-to-apng.ts";
import { Command } from "commander";

export function createCli(): Command {
	const program = new Command();

	program
		.name("spine2img")
		.description("Render Spine JSON animations to APNG.")
		.addCommand(
			new Command("render")
				.description("Render a Spine skeleton to an APNG file.")
				.argument("<skeleton>", "path to the Spine JSON skeleton")
				.argument("<output>", "path for the output APNG file")
				.option(
					"--atlas <atlas>",
					"path to the Spine atlas (defaults beside the skeleton; relative paths resolve from the current directory)",
				)
				.option("--animation <animation>", "exact animation name to render")
				.option("--fps <fps>", "frames per second", Number)
				.option("--skin <skin>", "exact skin name to apply")
				.action(async (skeleton, output, options) => {
					const result = await renderSpineToApng({
						skeletonPath: skeleton,
						outputPath: output,
						atlasPath: options.atlas,
						animationName: options.animation,
						skinName: options.skin,
						fps: options.fps,
					});

					console.log(
						`Rendered ${result.animationName} to ${result.outputPath} (${result.width}x${result.height}, ${result.frameCount} frames @ ${result.fps} fps).`,
					);
				}),
		);

	return program;
}

export async function runCli(argv = process.argv): Promise<void> {
	await createCli().parseAsync(argv);
}
