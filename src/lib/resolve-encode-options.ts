import type { EncodingMetadata } from "#/lib/encoding-metadata.ts";
import type { OutputFormat } from "#/lib/output-format.ts";

import { RenderOptionValidationError } from "#/lib/errors.ts";

const DEFAULT_LOSSY_WEBP_QUALITY = 80;

export interface ResolveEncodeOptionsInput {
	format: OutputFormat;
	lossless?: boolean;
	quality?: number;
}

export type ResolvedEncodeOptions = EncodingMetadata;

export function resolveEncodeOptions(options: ResolveEncodeOptionsInput): ResolvedEncodeOptions {
	const lossless = options.lossless ?? true;
	const qualityProvided = options.quality !== undefined;

	// WebP is the only format that supports lossy output, so reject lossy/quality
	// for every other format here. Whitelisting WebP (rather than singling out
	// APNG) fails safe: a future lossless-only format lands in this branch instead
	// of silently inheriting the lossy variant. Check format compatibility before
	// validating the quality range — an unsupported target is the more fundamental
	// mistake, and a range message would just send the user fixing the wrong thing.
	if (options.format !== "webp") {
		if (!lossless) {
			throw new RenderOptionValidationError({
				code: "unsupported-lossy-output",
				message: "lossless: false is only supported for WebP output.",
			});
		}

		if (qualityProvided) {
			throw new RenderOptionValidationError({
				code: "unsupported-quality-output",
				message: "quality is only supported for lossy WebP output.",
			});
		}

		return { lossless: true };
	}

	if (lossless) {
		if (qualityProvided) {
			throw new RenderOptionValidationError({
				code: "unsupported-quality-output",
				message: "quality is only supported for lossy WebP output.",
			});
		}

		return { lossless: true };
	}

	return {
		lossless: false,
		quality: validateQuality(options.quality) ?? DEFAULT_LOSSY_WEBP_QUALITY,
	};
}

function validateQuality(quality: number | undefined): number | undefined {
	if (quality === undefined) {
		return undefined;
	}

	if (!Number.isFinite(quality) || quality < 0 || quality > 100) {
		throw new RenderOptionValidationError({
			code: "invalid-quality",
			message: `quality must be a number between 0 and 100. Received ${String(quality)}.`,
		});
	}

	return quality;
}
