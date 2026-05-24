import { crc32 } from "node:zlib";

// UPNG hardcodes `acTL.num_plays = 0` (infinite) and `UPNG.encode` exposes no loop
// parameter, so the loop count is stamped onto the encoded bytes here rather than at
// encode time. This is a pure `bytes-in → bytes-out` patch over the PNG chunk stream:
// locate the `acTL` chunk, overwrite its `num_plays` field, and recompute the chunk
// CRC. UPNG only emits `acTL` for multi-frame output, so a single-frame plain PNG has
// no chunk to patch and passes through untouched — the loop option is silently inert.

// A PNG file begins with an 8-byte signature, then a sequence of chunks. Each chunk is
// a 4-byte big-endian data length, a 4-byte ASCII type, the data, and a 4-byte CRC
// computed over the type and data (not the length).
const PNG_SIGNATURE_BYTES = 8;
const CHUNK_LENGTH_BYTES = 4;
const CHUNK_TYPE_BYTES = 4;
const CHUNK_CRC_BYTES = 4;
const ACTL_TYPE = "acTL";
// `acTL` data is two big-endian uint32s: `num_frames` then `num_plays`.
const NUM_PLAYS_OFFSET_IN_DATA = 4;

export function patchApngLoop(png: Uint8Array, loop: number): Uint8Array {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
	let chunkStart = PNG_SIGNATURE_BYTES;

	// Walk the chunk stream until `acTL` is found or the bytes run out. Stop while a
	// full length+type header still fits, so a truncated trailer can never misread.
	while (chunkStart + CHUNK_LENGTH_BYTES + CHUNK_TYPE_BYTES <= png.byteLength) {
		const dataLength = view.getUint32(chunkStart);
		const typeStart = chunkStart + CHUNK_LENGTH_BYTES;
		const dataStart = typeStart + CHUNK_TYPE_BYTES;

		if (readChunkType(png, typeStart) === ACTL_TYPE) {
			// The body reads/writes below are not bounds-checked: UPNG always emits a
			// complete `acTL` (an 8-byte body plus its CRC), so they stay in range. A
			// truncated `acTL` would throw RangeError here rather than corrupt silently.
			// Copy before mutating so the input buffer is never clobbered.
			const patched = png.slice();
			const patchedView = new DataView(
				patched.buffer,
				patched.byteOffset,
				patched.byteLength,
			);

			patchedView.setUint32(dataStart + NUM_PLAYS_OFFSET_IN_DATA, loop);
			// CRC covers the chunk type and data, not the length prefix.
			patchedView.setUint32(
				dataStart + dataLength,
				crc32(patched.subarray(typeStart, dataStart + dataLength)),
			);

			return patched;
		}

		chunkStart = dataStart + dataLength + CHUNK_CRC_BYTES;
	}

	return png;
}

function readChunkType(png: Uint8Array, start: number): string {
	return String.fromCharCode(png[start], png[start + 1], png[start + 2], png[start + 3]);
}
