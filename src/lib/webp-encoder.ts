import type { AnimatedImageEncoder, EncodeAnimatedImageOptions } from "#/lib/animation-encoder.ts";

import { assertValidEncodeOptions, RGBA_CHANNEL_COUNT } from "#/lib/animation-encoder.ts";
import sharp from "sharp";

class WebpEncoder implements AnimatedImageEncoder<"webp"> {
	readonly format = "webp";

	async encode(options: EncodeAnimatedImageOptions): Promise<Uint8Array> {
		assertValidEncodeOptions(options);

		const encoded = await sharp(concatenateFrames(options.frames), {
			animated: true,
			raw: {
				channels: RGBA_CHANNEL_COUNT,
				height: options.height * options.frames.length,
				pageHeight: options.height,
				width: options.width,
			},
		})
			.webp({
				delay: options.delaysMs,
				effort: 4,
				lossless: options.lossless,
				loop: options.loop,
				quality: options.lossless ? undefined : options.quality,
			})
			.toBuffer();

		return new Uint8Array(encoded);
	}
}

export const webpEncoder = new WebpEncoder();

function concatenateFrames(frames: ArrayBuffer[]): Buffer {
	return Buffer.concat(frames.map((frame) => Buffer.from(frame)));
}
