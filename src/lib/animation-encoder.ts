export interface EncodeAnimatedImageOptions {
	delaysMs: number[];
	frames: ArrayBuffer[];
	height: number;
	width: number;
}

export interface AnimatedImageEncoder<TFormat extends string = string> {
	readonly format: TFormat;
	encode(options: EncodeAnimatedImageOptions): Promise<Uint8Array>;
}

export const RGBA_CHANNEL_COUNT = 4;

export function assertValidEncodeOptions(options: EncodeAnimatedImageOptions): void {
	if (options.frames.length === 0) {
		throw new Error("Animated encoders require at least one frame.");
	}

	if (options.delaysMs.length !== options.frames.length) {
		throw new Error(
			`Expected ${options.frames.length} frame delays, received ${options.delaysMs.length}.`,
		);
	}

	const expectedFrameByteLength = options.width * options.height * RGBA_CHANNEL_COUNT;

	for (const [index, frame] of options.frames.entries()) {
		if (frame.byteLength !== expectedFrameByteLength) {
			throw new Error(
				`Frame ${index} must contain ${expectedFrameByteLength} RGBA bytes, received ${frame.byteLength}.`,
			);
		}
	}
}
