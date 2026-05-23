import type { AnimatedImageEncoder } from "#/lib/animation-encoder.ts";
import type { OutputFormat } from "#/lib/output-format.ts";

import { apngEncoder } from "#/lib/apng-encoder.ts";
import { webpEncoder } from "#/lib/webp-encoder.ts";

const encoders: { [K in OutputFormat]: AnimatedImageEncoder<K> } = {
	apng: apngEncoder,
	webp: webpEncoder,
};

export function resolveAnimatedImageEncoder<TFormat extends OutputFormat>(
	format: TFormat,
): AnimatedImageEncoder<TFormat> {
	const encoder = encoders[format];

	if (!encoder) {
		throw new Error(`Unsupported output format: ${String(format)}.`);
	}

	return encoder;
}
