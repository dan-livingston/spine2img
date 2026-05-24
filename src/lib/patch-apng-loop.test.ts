import { patchApngLoop } from "#/lib/patch-apng-loop.ts";
import { toArrayBuffer } from "#/lib/to-array-buffer.ts";
import { crc32 } from "node:zlib";
import UPNG from "upng-js";
import { expect, test } from "vite-plus/test";

const WIDTH = 2;
const HEIGHT = 2;
// Two distinct 2x2 RGBA frames, enough for UPNG to emit a multi-frame `acTL` chunk.
const MULTI_FRAME = [
	Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 255]),
	Uint8Array.from([0, 0, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255]),
];

function encodeApng(frames: Uint8Array[]): Uint8Array {
	return new Uint8Array(
		UPNG.encode(
			frames.map((frame) => toArrayBuffer(frame)),
			WIDTH,
			HEIGHT,
			0,
			frames.length > 1 ? frames.map(() => 40) : undefined,
		),
	);
}

// Locates the `acTL` chunk and reports whether its stored 4-byte CRC matches a fresh
// CRC over the chunk's type and data. UPNG.decode does not verify chunk CRCs, so the
// patch's CRC recomputation is checked here directly rather than inferred from a
// successful decode.
function acTlCrcIsValid(png: Uint8Array): boolean {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	let offset = 8;

	while (offset + 8 <= png.byteLength) {
		const length = view.getUint32(offset);
		const typeStart = offset + 4;
		const dataStart = offset + 8;
		const type = String.fromCharCode(
			png[typeStart],
			png[typeStart + 1],
			png[typeStart + 2],
			png[typeStart + 3],
		);

		if (type === "acTL") {
			const storedCrc = view.getUint32(dataStart + length);

			return storedCrc === crc32(png.subarray(typeStart, dataStart + length));
		}

		offset = dataStart + length + 4;
	}

	return false;
}

test("patchApngLoop sets acTL num_plays to the requested count", () => {
	for (const count of [0, 1, 7]) {
		const decoded = UPNG.decode(toArrayBuffer(patchApngLoop(encodeApng(MULTI_FRAME), count)));

		expect(decoded.tabs.acTL?.num_plays).toBe(count);
	}
});

test("patchApngLoop recomputes a valid acTL chunk CRC", () => {
	// The encoder leaves a valid CRC; a naive num_plays overwrite would invalidate it.
	expect(acTlCrcIsValid(encodeApng(MULTI_FRAME))).toBe(true);
	expect(acTlCrcIsValid(patchApngLoop(encodeApng(MULTI_FRAME), 1))).toBe(true);
});

test("patchApngLoop returns a single-frame PNG unchanged (no acTL to patch)", () => {
	const encoded = encodeApng([MULTI_FRAME[0]]);
	const patched = patchApngLoop(encoded, 1);

	// No acTL chunk exists, so the bytes are returned untouched and the loop option
	// is inert.
	expect(patched).toBe(encoded);
	expect(UPNG.decode(toArrayBuffer(patched)).tabs.acTL).toBeUndefined();
});
