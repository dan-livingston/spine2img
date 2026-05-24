import { RenderOptionValidationError } from "#/lib/errors.ts";

// The format-native infinite-loop count (APNG `acTL.num_plays`, WebP loop count).
// The default everywhere, so an omitted loop option preserves the historical
// always-loop behavior.
export const INFINITE_LOOP = 0;

// Resolves a single-render loop count. A single render targets one named animation,
// so this is a plain scalar — the batch policy shape lives in its own resolver.
// `0 = infinite`; any other count is the exact number of plays. Owns the scalar
// validation so the encoder seam can trust an already-validated count.
export function resolveLoop(loop?: number): number {
	if (loop === undefined) {
		return INFINITE_LOOP;
	}

	if (!Number.isInteger(loop) || loop < 0) {
		throw new RenderOptionValidationError({
			code: "invalid-loop",
			message: `loop must be a non-negative integer. Received ${String(loop)}.`,
		});
	}

	return loop;
}
