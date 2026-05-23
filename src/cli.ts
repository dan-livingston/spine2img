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
				.option("--fps <fps>", "frames per second", Number)
				.action(async (skeleton, output, options) => {
					const result = await renderSpineToApng({
						atlasPath: options.atlas,
						fps: options.fps,
						outputPath: output,
						skeletonPath: skeleton,
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
