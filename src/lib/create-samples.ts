import type { Sample } from "#/lib/renderer-backend.ts";

// Builds the per-frame sampling plan for an animation: one sample per frame at the
// target fps, clamped to at least one frame so a zero-length pose still renders.
// Shared by the per-variation render and the registered-canvas measure pass, so a
// skin's union bounds are measured over exactly the frame times it will render.
export function createSamples(durationSeconds: number, fps: number): Sample[] {
	const frameDelayMs = Math.max(1, Math.round(1000 / fps));
	const sampleCount = Math.max(1, Math.ceil(durationSeconds * fps));

	return Array.from({ length: sampleCount }, (_, index) => ({
		delayMs: frameDelayMs,
		timeSeconds: sampleCount === 1 ? 0 : Math.min(index / fps, durationSeconds),
	}));
}
