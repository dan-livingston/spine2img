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
		lossless: true,
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

test("webpEncoder writes smaller lossy WebP output than lossless for the same frames", async () => {
	const frames = createTestFrames(3, 48, 48);
	const lossless = await webpEncoder.encode({
		delaysMs: [50, 50, 50],
		frames,
		height: 48,
		lossless: true,
		width: 48,
	});
	const lossy = await webpEncoder.encode({
		delaysMs: [50, 50, 50],
		frames,
		height: 48,
		lossless: false,
		quality: 80,
		width: 48,
	});
	const metadata = await sharp(lossy, { animated: true }).metadata();

	expect(lossy.byteLength).toBeLessThan(lossless.byteLength);
	expect(metadata.format).toBe("webp");
	expect(metadata.pages).toBe(3);
});

test("webpEncoder quality affects lossy WebP size", async () => {
	const frames = createTestFrames(3, 48, 48);
	const lowQuality = await webpEncoder.encode({
		delaysMs: [50, 50, 50],
		frames,
		height: 48,
		lossless: false,
		quality: 20,
		width: 48,
	});
	const highQuality = await webpEncoder.encode({
		delaysMs: [50, 50, 50],
		frames,
		height: 48,
		lossless: false,
		quality: 90,
		width: 48,
	});

	expect(lowQuality.byteLength).toBeLessThan(highQuality.byteLength);
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

function createTestFrames(frameCount: number, width: number, height: number): ArrayBuffer[] {
	return Array.from({ length: frameCount }, (_, frameIndex) => {
		const frame = new Uint8Array(width * height * 4);

		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const offset = (y * width + x) * 4;
				frame[offset] = clampColor(
					(Math.sin((x + frameIndex * 5) / 6) + 1) * 92 +
						(Math.cos((x + y) / 15) + 1) * 28,
				);
				frame[offset + 1] = clampColor(
					(Math.sin((y + frameIndex * 3) / 8) + 1) * 88 + (Math.cos(x / 17) + 1) * 34,
				);
				frame[offset + 2] = clampColor(
					(Math.sin((x + y + frameIndex * 7) / 11) + 1) * 84 +
						(Math.cos(y / 13) + 1) * 40,
				);
				frame[offset + 3] = 255;
			}
		}

		return frame.buffer.slice(0);
	});
}

function clampColor(value: number): number {
	return Math.max(0, Math.min(255, Math.round(value)));
}
