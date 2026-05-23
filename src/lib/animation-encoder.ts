export interface EncodeAnimatedImageOptions {
	delaysMs: number[];
	frames: ArrayBuffer[];
	height: number;
	width: number;
}

export interface AnimatedImageEncoder<TFormat extends string = string> {
	readonly format: TFormat;
	encode(options: EncodeAnimatedImageOptions): Uint8Array;
}
