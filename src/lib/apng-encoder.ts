import type { AnimatedImageEncoder, EncodeAnimatedImageOptions } from "#/lib/animation-encoder.ts";

import { assertValidEncodeOptions } from "#/lib/animation-encoder.ts";
import UPNG from "upng-js";

class ApngEncoder implements AnimatedImageEncoder<"apng"> {
	readonly format = "apng";

	async encode(options: EncodeAnimatedImageOptions): Promise<Uint8Array> {
		assertValidEncodeOptions(options);

		return new Uint8Array(
			UPNG.encode(
				options.frames,
				options.width,
				options.height,
				0,
				options.frames.length > 1 ? options.delaysMs : undefined,
			),
		);
	}
}

export const apngEncoder = new ApngEncoder();
