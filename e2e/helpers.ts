import { toArrayBuffer } from "#/lib/to-array-buffer.ts";
import { execFile } from "node:child_process";
import { cp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import UPNG from "upng-js";

const execFileAsync = promisify(execFile);
const rootDirectory = path.resolve(new URL("..", import.meta.url).pathname);

export const fixtureDirectory = path.join(rootDirectory, "fixtures", "tracer-bullet");
export const fixtureSkeletonPath = path.join(fixtureDirectory, "box.json");

export async function importPackageApi(): Promise<typeof import("#/index.ts")> {
	return (await import(
		pathToFileURL(path.join(rootDirectory, "dist", "index.mjs")).href
	)) as typeof import("#/index.ts");
}

export function runCli(args: string[]) {
	return execFileAsync("node", [path.join(rootDirectory, "dist", "bin.mjs"), ...args], {
		cwd: rootDirectory,
	});
}

export function decodeApng(file: Uint8Array) {
	const decoded = UPNG.decode(toArrayBuffer(file));

	return {
		frameCount: UPNG.toRGBA8(decoded).length,
		height: decoded.height,
		width: decoded.width,
	};
}

export function decodeApngFrames(file: Uint8Array) {
	const decoded = UPNG.decode(toArrayBuffer(file));

	return {
		frames: UPNG.toRGBA8(decoded).map((frame) => new Uint8Array(frame)),
		height: decoded.height,
		width: decoded.width,
	};
}

export function readPixel(
	frame: Uint8Array,
	width: number,
	x: number,
	y: number,
): [number, number, number, number] {
	const offset = (y * width + x) * 4;

	return [
		frame[offset] ?? 0,
		frame[offset + 1] ?? 0,
		frame[offset + 2] ?? 0,
		frame[offset + 3] ?? 0,
	];
}

export async function createSelectableFixture(tempDirectory: string): Promise<string> {
	const fixtureCopyDirectory = path.join(tempDirectory, "fixture");
	const skeletonPath = path.join(fixtureCopyDirectory, "box.json");
	await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });

	const skeleton = JSON.parse(await readFile(skeletonPath, "utf8")) as {
		animations: Record<string, unknown>;
		skins: Array<{
			attachments: Record<string, unknown>;
			name: string;
		}>;
	};

	skeleton.animations["pulse-short"] = {
		bones: {
			bone: {
				translate: [
					{
						time: 0,
						x: -16,
						y: 0,
					},
					{
						time: 0.25,
						x: 16,
						y: 0,
					},
					{
						time: 0.5,
						x: -16,
						y: 0,
					},
				],
			},
		},
	};
	// Give "alt" a deliberately smaller box so selecting it changes the rendered
	// bounds — otherwise a test cannot tell "applied alt" from "ignored the skin".
	skeleton.skins.push({
		attachments: {
			box: {
				box: {
					type: "region",
					path: "box",
					width: 32,
					height: 32,
				},
			},
		},
		name: "alt",
	});

	await writeFile(skeletonPath, `${JSON.stringify(skeleton, null, "\t")}\n`);

	return fixtureCopyDirectory;
}
