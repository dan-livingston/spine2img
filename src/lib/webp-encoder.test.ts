import { webpEncoder } from "#/lib/webp-encoder.ts";
import sharp from "sharp";
import { expect, test } from "vite-plus/test";

test("webpEncoder writes lossless animated WebP from straight-alpha RGBA frames", async () => {
	const width = 2;
	const height = 2;
	const delaysMs = [40, 80];
	const frames = [
		Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0]),
		Uint8Array.from([0, 0, 0, 0, 255, 255, 0, 128, 255, 0, 255, 64, 0, 255, 255, 255]),
	];
	const encoded = await webpEncoder.encode({
		delaysMs,
		frames: frames.map((frame) => frame.buffer.slice(0)),
		height,
		width,
	});
	const metadata = await sharp(encoded, { animated: true }).metadata();
	const { data, info } = await sharp(encoded, { animated: true })
		.raw()
		.toBuffer({ resolveWithObject: true });

	expect(metadata).toMatchObject({
		delay: delaysMs,
		format: "webp",
		height: height * frames.length,
		loop: 0,
		pageHeight: height,
		pages: frames.length,
		width,
	});
	expect(info).toMatchObject({
		channels: 4,
		height: height * frames.length,
		pageHeight: height,
		pages: frames.length,
		premultiplied: false,
		width,
	});
	expect(splitFrames(data, width, height, frames.length)).toEqual(frames);
});

function splitFrames(
	encodedFrames: Uint8Array,
	width: number,
	height: number,
	frameCount: number,
): Uint8Array[] {
	const frameByteLength = width * height * 4;

	return Array.from({ length: frameCount }, (_, index) => {
		const start = index * frameByteLength;
		const end = start + frameByteLength;

		return new Uint8Array(encodedFrames.slice(start, end));
	});
}
