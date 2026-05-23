import { toArrayBuffer } from "#/lib/to-array-buffer.ts";
import { expect, test } from "vite-plus/test";

test("copies exactly byteLength bytes from a pooled Buffer", () => {
	// Small Buffer.from allocations come from Node's shared 8 KiB pool, so the
	// backing ArrayBuffer is far larger than the logical contents.
	const buffer = Buffer.from("34-byte-payload-aaaaaaaaaaaaaaaaaa");

	expect(toArrayBuffer(buffer).byteLength).toBe(buffer.byteLength);
});

test("reads from byteOffset, not offset 0 of the backing buffer", () => {
	// The latent failure: a view into the middle of a larger allocation must
	// yield its own bytes, not whatever precedes it in the backing store.
	const backing = Buffer.alloc(64);
	backing.write("PRECEDING-JUNK", 0, "latin1");
	backing.write("REAL-PAYLOAD", 20, "latin1");
	const view = backing.subarray(20, 20 + "REAL-PAYLOAD".length);

	const result = Buffer.from(toArrayBuffer(view)).toString("latin1");

	expect(result).toBe("REAL-PAYLOAD");
});

test("returns an independent copy that does not alias the source", () => {
	const source = Uint8Array.from([1, 2, 3, 4]);
	const copy = new Uint8Array(toArrayBuffer(source));

	source[0] = 99;

	expect(Array.from(copy)).toEqual([1, 2, 3, 4]);
});
