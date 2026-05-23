import { renderSpineToApng } from "#/render-spine-to-apng.ts";
import { Command } from "commander";

export function createCli(): Command {
	const program = new Command();

	program
		.name("spine2img")
		.description("Render Spine JSON animations to APNG.")
		.addCommand(
			new Command("render")
				.description("Render a Spine skeleton and atlas to an APNG file.")
				.argument("<skeleton>", "path to the Spine JSON skeleton")
				.argument("<atlas>", "path to the Spine atlas")
				.argument("<output>", "path for the output APNG file")
				.option("--fps <fps>", "frames per second", Number)
				.action(async (skeleton, atlas, output, options) => {
					const result = await renderSpineToApng({
						atlasPath: atlas,
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
