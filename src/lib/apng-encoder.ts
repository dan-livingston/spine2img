import type { AnimatedImageEncoder, EncodeAnimatedImageOptions } from "#/lib/animation-encoder.ts";

import { assertValidEncodeOptions } from "#/lib/animation-encoder.ts";
import { patchApngLoop } from "#/lib/patch-apng-loop.ts";
import UPNG from "upng-js";

class ApngEncoder implements AnimatedImageEncoder<"apng"> {
	readonly format = "apng";

	async encode(options: EncodeAnimatedImageOptions): Promise<Uint8Array> {
		assertValidEncodeOptions(options);

		const encoded = new Uint8Array(
			UPNG.encode(
				options.frames,
				options.width,
				options.height,
				0,
				options.frames.length > 1 ? options.delaysMs : undefined,
			),
		);

		// UPNG hardcodes `acTL.num_plays = 0`, so the loop count is stamped onto the
		// encoded bytes. No-ops for single-frame output, which has no `acTL` chunk.
		return patchApngLoop(encoded, options.loop);
	}
}

export const apngEncoder = new ApngEncoder();
