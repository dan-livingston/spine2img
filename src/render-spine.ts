import type { EncodingMetadata, LosslessEncoding } from "#/lib/encoding-metadata.ts";
import type { OutputFormat } from "#/lib/output-format.ts";

import { normalizeBackgroundColor } from "#/lib/background-color.ts";
import { canvasSpineRenderer } from "#/lib/canvas-spine-renderer.ts";
import { OutputCollisionError } from "#/lib/errors.ts";
import { isMissingFileError } from "#/lib/node-errors.ts";
import { renderVariation } from "#/lib/render-variation.ts";
import { resolveAnimatedImageEncoder } from "#/lib/resolve-animated-image-encoder.ts";
import { resolveEncodeOptions } from "#/lib/resolve-encode-options.ts";
import { resolveFormat, type ResolvedOutputFormat } from "#/lib/resolve-format.ts";
import { resolveSpineInputs } from "#/lib/resolve-spine-inputs.ts";
import { validateExplicitDimension } from "#/lib/validate-dimension.ts";
import { writeOutputFile } from "#/lib/write-output-file.ts";
import { access, mkdir } from "node:fs/promises";
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

interface RenderSpineResultBase<TFormat extends OutputFormat> {
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

type RenderSpineEncodingResult<TFormat extends OutputFormat> = TFormat extends "webp"
	? EncodingMetadata
	: LosslessEncoding;

export type RenderSpineResult<TFormat extends OutputFormat = OutputFormat> =
	RenderSpineResultBase<TFormat> & RenderSpineEncodingResult<TFormat>;

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

	const assets = await canvasSpineRenderer.loadAssets({
		atlasPath,
		skeletonPath,
	});

	try {
		const variation = canvasSpineRenderer.resolveVariation(assets, {
			animationName: options.animationName,
			skinName: options.skinName,
		});
		const { encoded, result } = await renderVariation(canvasSpineRenderer, assets, {
			atlasPath,
			backgroundColor,
			encodeOptions,
			encoder,
			format,
			fps,
			height: explicitHeight,
			outputPath,
			resolved: variation,
			skeletonPath,
			width: explicitWidth,
		});

		await mkdir(path.dirname(outputPath), { recursive: true });
		await writeOutputFile(outputPath, encoded, overwrite);

		return result;
	} finally {
		canvasSpineRenderer.disposeAssets(assets);
	}
}

export function renderSpineToApng(
	options: Omit<RenderSpineOptions, "format">,
): Promise<RenderSpineResult<"apng">> {
	return renderSpine({ ...options, format: "apng" });
}

export function renderSpineToWebp(
	options: Omit<RenderSpineOptions, "format">,
): Promise<RenderSpineResult<"webp">> {
	return renderSpine({ ...options, format: "webp" });
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
