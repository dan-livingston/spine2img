declare module "upng-js" {
	interface DecodedPng {
		ctype: number;
		data: ArrayBuffer;
		depth: number;
		frames: Array<{
			delay: number;
		}>;
		height: number;
		tabs: {
			acTL?: {
				num_frames: number;
				num_plays: number;
			};
		} & Record<string, unknown>;
		width: number;
	}

	const UPNG: {
		decode(buffer: ArrayBuffer): DecodedPng;
		encode(
			frames: ArrayBuffer[],
			width: number,
			height: number,
			colorCount: number,
			delays?: number[],
		): ArrayBuffer;
		toRGBA8(decoded: DecodedPng): ArrayBuffer[];
	};

	export default UPNG;
}
