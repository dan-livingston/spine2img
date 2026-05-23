declare module "upng-js" {
	interface DecodedPng {
		ctype: number;
		data: ArrayBuffer;
		depth: number;
		frames: Array<{
			delay: number;
		}>;
		height: number;
		tabs: Record<string, unknown>;
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
