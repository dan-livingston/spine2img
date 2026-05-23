import { toArrayBuffer } from "#/lib/to-array-buffer.ts";
import { execFile } from "node:child_process";
import { cp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import sharp from "sharp";
import UPNG from "upng-js";

const execFileAsync = promisify(execFile);
const rootDirectory = path.resolve(new URL("..", import.meta.url).pathname);

export const fixtureDirectory = path.join(rootDirectory, "fixtures", "tracer-bullet");
export const fixtureSkeletonPath = path.join(fixtureDirectory, "box.json");

export async function importPackageApi(): Promise<typeof import("#/index.ts")> {
	const { packageEntryPath } = await readInstalledPackageMetadata();

	return (await import(pathToFileURL(packageEntryPath).href)) as typeof import("#/index.ts");
}

export function runCli(args: string[]) {
	return execFileAsync(getInstalledCliPath(), args, {
		cwd: rootDirectory,
	});
}

interface InstalledPackageJson {
	bin?: Record<string, string>;
	exports?: Record<string, string | { import?: string; types?: string }>;
	files?: string[];
	name: string;
	types?: string;
	version: string;
}

export async function readInstalledPackageJson(): Promise<InstalledPackageJson> {
	return (await readInstalledPackageMetadata()).packageJson;
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

export async function decodeWebpFrames(file: Uint8Array) {
	const metadata = await sharp(file, { animated: true }).metadata();
	const { data } = await sharp(file, { animated: true })
		.raw()
		.toBuffer({ resolveWithObject: true });
	const width = metadata.width ?? 0;
	const height = metadata.pageHeight ?? metadata.height ?? 0;
	const frameCount = metadata.pages ?? 1;
	const frameByteLength = width * height * 4;

	return {
		delay: metadata.delay ?? [],
		format: metadata.format,
		frames: Array.from({ length: frameCount }, (_, index) => {
			const start = index * frameByteLength;
			const end = start + frameByteLength;

			return new Uint8Array(data.slice(start, end));
		}),
		height,
		loop: metadata.loop ?? 0,
		width,
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

export async function createNoisyFixture(tempDirectory: string): Promise<string> {
	const fixtureCopyDirectory = path.join(tempDirectory, "noisy-fixture");
	const texturePath = path.join(fixtureCopyDirectory, "box.png");
	await cp(fixtureDirectory, fixtureCopyDirectory, { recursive: true });
	const metadata = await sharp(texturePath).metadata();
	const width = metadata.width ?? 64;
	const height = metadata.height ?? 64;

	await sharp(createNoiseTexture(width, height), {
		raw: {
			channels: 4,
			height,
			width,
		},
	})
		.png()
		.toFile(texturePath);

	return fixtureCopyDirectory;
}

function getConsumerRequire() {
	return createRequire(path.join(getConsumerDirectory(), "package.json"));
}

function createNoiseTexture(width: number, height: number): Uint8Array {
	const texture = new Uint8Array(width * height * 4);

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const offset = (y * width + x) * 4;
			texture[offset] = clampColor(
				(Math.sin(x / 6) + 1) * 92 + (Math.cos((x + y) / 15) + 1) * 28,
			);
			texture[offset + 1] = clampColor(
				(Math.sin(y / 8) + 1) * 88 + (Math.cos(x / 17) + 1) * 34,
			);
			texture[offset + 2] = clampColor(
				(Math.sin((x + y) / 11) + 1) * 84 + (Math.cos(y / 13) + 1) * 40,
			);
			texture[offset + 3] = 255;
		}
	}

	return texture;
}

function clampColor(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}

async function readInstalledPackageMetadata() {
	const consumerRequire = getConsumerRequire();
	const packageJsonPath = consumerRequire.resolve("spine2img/package.json");
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as InstalledPackageJson;
	const packageRoot = path.dirname(packageJsonPath);
	const entryExport = packageJson.exports?.["."];
	const packageEntryPath =
		typeof entryExport === "string"
			? path.join(packageRoot, entryExport)
			: entryExport?.import
				? path.join(packageRoot, entryExport.import)
				: undefined;

	if (!packageEntryPath) {
		throw new Error(`Installed package does not define an import entry in ${packageJsonPath}.`);
	}

	return {
		packageEntryPath,
		packageJson,
	};
}

function getInstalledCliPath(): string {
	// Resolves the POSIX bin shim directly; on Windows the installed bin is a
	// .cmd/.ps1 wrapper, so this would need the extension (CI is Linux-only).
	return path.join(getConsumerDirectory(), "node_modules", ".bin", "spine2img");
}

function getConsumerDirectory(): string {
	const consumerDirectory = process.env.SPINE2IMG_E2E_CONSUMER_DIRECTORY;

	if (!consumerDirectory) {
		throw new Error("SPINE2IMG_E2E_CONSUMER_DIRECTORY is not set.");
	}

	return consumerDirectory;
}
