import { RenderOptionValidationError } from "#/lib/errors.ts";
import picomatch from "picomatch";

// The format-native infinite-loop count (APNG `acTL.num_plays`, WebP loop count).
// The default everywhere, so an omitted loop option preserves the historical
// always-loop behavior.
export const INFINITE_LOOP = 0;

// The count `once` patterns resolve to: play the arc exactly once and rest on the
// final frame — the one-shot fix.
const PLAY_ONCE = 1;

// The batch loop policy. A scalar is shorthand for `{ default: <n> }`. `once` globs
// classify animations as play-once (count `1`), `infinite` globs as loop-forever
// (count `0`), and every unmatched animation falls back to `default` (itself `0`
// when omitted). Loop intent is a property of the animation name alone — never the
// skin — so the policy resolves once per run and applies across every skin.
export type LoopPolicy =
	| number
	| {
			default?: number;
			infinite?: string[];
			once?: string[];
	  };

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

// Resolves a batch policy against the run's animation names into a per-animation
// loop count, keyed on animation name only. The central fail-fast gate for batch
// looping: a bad default count, a pattern that matches nothing, or an animation two
// patterns disagree on each abort the whole run before any file is written.
//
// Precedence is order-independent by design: rather than crown a winner among
// overlapping patterns (commander hands each repeatable flag back as its own array,
// losing the interleaved cross-flag order), genuine disagreement — `once` and
// `infinite` both claiming one animation — is a `loop-pattern-conflict` error.
// Patterns that agree on a count never conflict.
export function resolveLoopPolicy(
	policy: LoopPolicy | undefined,
	animationNames: string[],
): Map<string, number> {
	const normalized = typeof policy === "number" ? { default: policy } : (policy ?? {});
	const defaultCount = resolveLoop(normalized.default);

	// `once` first, then `infinite`; the count travels with each pattern so a
	// conflicting assignment can name both the animation and the patterns at fault.
	const patterns = [
		...(normalized.once ?? []).map((pattern) => ({ count: PLAY_ONCE, pattern })),
		...(normalized.infinite ?? []).map((pattern) => ({ count: INFINITE_LOOP, pattern })),
	];

	// animationName -> the (pattern, count) assignments that matched it.
	const assignments = new Map<string, { count: number; pattern: string }[]>();

	for (const { count, pattern } of patterns) {
		const isMatch = compilePattern(pattern);
		let matched = false;

		for (const name of animationNames) {
			if (!isMatch(name)) {
				continue;
			}

			matched = true;
			const existing = assignments.get(name);

			if (existing) {
				existing.push({ count, pattern });
			} else {
				assignments.set(name, [{ count, pattern }]);
			}
		}

		// A pattern that matches nothing is almost always a typo; failing loudly here
		// stops it from silently doing nothing.
		if (!matched) {
			throw new RenderOptionValidationError({
				code: "loop-pattern-no-match",
				message: `Loop pattern "${pattern}" matched no animations.`,
			});
		}
	}

	const counts = new Map<string, number>();

	for (const name of animationNames) {
		const assigned = assignments.get(name);

		if (!assigned) {
			counts.set(name, defaultCount);
			continue;
		}

		const distinctCounts = new Set(assigned.map((assignment) => assignment.count));

		if (distinctCounts.size > 1) {
			const conflicting = assigned.map((assignment) => `"${assignment.pattern}"`).join(", ");

			throw new RenderOptionValidationError({
				code: "loop-pattern-conflict",
				message: `Animation "${name}" is matched by conflicting loop patterns: ${conflicting}.`,
			});
		}

		// Exactly one distinct count survives the conflict check.
		counts.set(name, assigned[0]?.count ?? defaultCount);
	}

	return counts;
}

// The null byte never occurs in a Spine animation name, so swapping `/` for it in
// both the pattern and the candidate lets `*` (`[^/]*`) range freely across Spine's
// grouping separators — the PRD's "treat the name as a flat string" rule — while a
// pattern that does spell out `group/...` still lines up. The default anchored,
// case-sensitive matching is what we want; `dot: true` keeps a leading `.` from
// being a special case so the string really is treated as flat.
const SLASH_SENTINEL = String.fromCharCode(0);

function compilePattern(pattern: string): (name: string) => boolean {
	const isMatch = picomatch(flatten(pattern), { dot: true });

	return (name: string) => isMatch(flatten(name));
}

function flatten(value: string): string {
	return value.split("/").join(SLASH_SENTINEL);
}
