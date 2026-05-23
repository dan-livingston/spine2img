import type { OutputFormat } from "#/lib/output-format.ts";
import type { Sample, Viewport } from "#/lib/renderer-backend.ts";

import { canvasSpineRenderer } from "#/lib/canvas-spine-renderer.ts";
import { OutputCollisionError } from "#/lib/errors.ts";
import { isMissingFileError, isNodeErrorWithCode } from "#/lib/node-errors.ts";
import { resolveAnimatedImageEncoder } from "#/lib/resolve-animated-image-encoder.ts";
import { resolveEncodeOptions } from "#/lib/resolve-encode-options.ts";
import { resolveFormat, type ResolvedOutputFormat } from "#/lib/resolve-format.ts";
import { resolveSpineInputs } from "#/lib/resolve-spine-inputs.ts";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_FPS = 30;

export type { OutputFormat };

export interface RenderSpineOptions<TOutputPath extends string = string> {
	animationName?: string;
	atlasPath?: string;
	backgroundColor?: string;
	fps?: number;
	format?: OutputFormat;
	height?: number;
	lossless?: boolean;
	outputPath: TOutputPath;
	overwrite?: boolean;
	quality?: number;
	skeletonPath: string;
	skinName?: string;
	width?: number;
}

export interface RenderSpineResult<TFormat extends OutputFormat = OutputFormat> {
	animationName: string;
	atlasPath: string;
	durationMs: number;
	format: TFormat;
	fps: number;
	frameCount: number;
	height: number;
	outputPath: string;
	skeletonPath: string;
	skinName?: string;
	width: number;
}

export function renderSpine<TFormat extends OutputFormat>(
	options: RenderSpineOptions & { format: TFormat },
): Promise<RenderSpineResult<TFormat>>;
export function renderSpine<TOutputPath extends string>(
	options: RenderSpineOptions<TOutputPath>,
): Promise<RenderSpineResult<ResolvedOutputFormat<TOutputPath>>>;
export async function renderSpine(options: RenderSpineOptions): Promise<RenderSpineResult> {
	const fps = options.fps ?? DEFAULT_FPS;

	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error(`fps must be a positive number. Received ${fps}.`);
	}

	const backgroundColor = normalizeBackgroundColor(options.backgroundColor);
	const explicitWidth = validateExplicitDimension("width", options.width);
	const explicitHeight = validateExplicitDimension("height", options.height);
	const format = resolveFormat({
		format: options.format,
		outputPath: options.outputPath,
	});
	const encodeOptions = resolveEncodeOptions({
		format,
		lossless: options.lossless,
		quality: options.quality,
	});
	const encoder = resolveAnimatedImageEncoder(format);
	const inputs = resolveSpineInputs({
		atlasPath: options.atlasPath,
		skeletonPath: options.skeletonPath,
	});
	const skeletonPath = inputs.skeletonPath;
	const atlasPath = inputs.atlasPath;
	const outputPath = path.resolve(options.outputPath);
	const overwrite = options.overwrite ?? false;

	await assertOutputWritable(outputPath, overwrite);

	const scene = await canvasSpineRenderer.loadScene({
		animationName: options.animationName,
		atlasPath,
		skeletonPath,
		skinName: options.skinName,
	});

	try {
		const samples = createSamples(scene.animationDurationSeconds, fps);
		const bounds = canvasSpineRenderer.measureBounds(scene, samples);
		const viewport: Viewport = {
			backgroundColor,
			height: explicitHeight ?? bounds.height,
			width: explicitWidth ?? bounds.width,
		};
		const frames = canvasSpineRenderer.renderFrames(scene, samples, bounds, viewport);
		const encoded = await encoder.encode({
			delaysMs: samples.map((sample) => sample.delayMs),
			frames,
			height: viewport.height,
			lossless: encodeOptions.lossless,
			quality: encodeOptions.quality,
			width: viewport.width,
		});

		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeOutputFile(outputPath, encoded, overwrite);

		return {
			animationName: scene.animationName,
			atlasPath,
			durationMs: samples.reduce((total, sample) => total + sample.delayMs, 0),
			format,
			fps,
			frameCount: frames.length,
			height: viewport.height,
			outputPath,
			skeletonPath,
			skinName: scene.skinName,
			width: viewport.width,
		};
	} finally {
		canvasSpineRenderer.disposeScene(scene);
	}
}

export function renderSpineToApng(
	options: Omit<RenderSpineOptions, "format">,
): Promise<RenderSpineResult<"apng">> {
	return renderSpine({ ...options, format: "apng" });
}

async function assertOutputWritable(outputPath: string, overwrite: boolean): Promise<void> {
	if (overwrite) {
		return;
	}

	try {
		await access(outputPath);
	} catch (error) {
		if (isMissingFileError(error)) {
			return;
		}

		throw error;
	}

	throw new OutputCollisionError({
		code: "existing-output",
		message: `Output already exists at ${outputPath}.`,
		outputPath,
	});
}

async function writeOutputFile(
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

function createSamples(durationSeconds: number, fps: number): Sample[] {
	const frameDelayMs = Math.max(1, Math.round(1000 / fps));
	const sampleCount = Math.max(1, Math.ceil(durationSeconds * fps));

	return Array.from({ length: sampleCount }, (_, index) => ({
		delayMs: frameDelayMs,
		timeSeconds: sampleCount === 1 ? 0 : Math.min(index / fps, durationSeconds),
	}));
}

function validateExplicitDimension(
	name: "height" | "width",
	value: number | undefined,
): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer. Received ${value}.`);
	}

	return value;
}

function normalizeBackgroundColor(backgroundColor: string | undefined): string | undefined {
	if (backgroundColor === undefined) {
		return undefined;
	}

	const normalized = backgroundColor.trim();
	const hexMatch = /^#(?<hex>[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(normalized);

	if (!hexMatch?.groups?.hex) {
		throw new Error(
			`backgroundColor must be a hex color like #rgb, #rgba, #rrggbb, or #rrggbbaa. Received ${backgroundColor}.`,
		);
	}

	const hex = hexMatch.groups.hex;
	const expanded =
		hex.length === 3 || hex.length === 4
			? Array.from(hex, (character) => `${character}${character}`).join("")
			: hex;
	const red = Number.parseInt(expanded.slice(0, 2), 16);
	const green = Number.parseInt(expanded.slice(2, 4), 16);
	const blue = Number.parseInt(expanded.slice(4, 6), 16);
	const alphaByte = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) : 255;

	return `rgba(${red}, ${green}, ${blue}, ${Number((alphaByte / 255).toFixed(3))})`;
}
