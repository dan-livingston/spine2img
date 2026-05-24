import { SpineSelectionError } from "#/lib/errors.ts";

export interface BatchVariation {
	animationName: string;
	skinName?: string;
}

export interface EnumerateVariationsInput {
	animationNames: string[];
	// The skin subset the caller asked for (repeatable `--skin` / `skinNames`).
	// Omitted or empty means "all skins": the automatic set below.
	requestedSkinNames?: string[];
	// Carried only so an unknown-skin error can name its source skeleton.
	skeletonPath: string;
	// Every skin the skeleton declares, in declared order, including the special
	// `default` skin.
	skinNames: string[];
}

const DEFAULT_SKIN_NAME = "default";

// Expands a skeleton into the ordered list of (skin, animation) variations to
// render. Skins come from the requested subset, or — by default — the automatic
// "all skins" set: the skeleton's named skins, excluding the special `default`
// skin when named skins exist, falling back to `default` when it is the only
// skin, and to a single skinless entry when the skeleton has no skins at all.
//
// Ordering is skin-major: every animation of a skin is contiguous, which both
// matches the `<outDir>/<skin>/<animation>` layout and lets a later slice run a
// single per-skin measure pass over a contiguous run. Both axes follow
// skeleton-declared order so a run is deterministic regardless of flag order.
export function enumerateVariations(input: EnumerateVariationsInput): BatchVariation[] {
	const skins = selectSkins(input);

	return skins.flatMap((skinName) =>
		input.animationNames.map((animationName) => ({ animationName, skinName })),
	);
}

function selectSkins(input: EnumerateVariationsInput): (string | undefined)[] {
	const requested = input.requestedSkinNames ?? [];

	if (requested.length > 0) {
		return selectRequestedSkins(input, requested);
	}

	return selectAutomaticSkins(input.skinNames);
}

function selectAutomaticSkins(skinNames: string[]): (string | undefined)[] {
	// Skinless skeleton: a single skinless entry, rendered flat with no skin
	// segment.
	if (skinNames.length === 0) {
		return [undefined];
	}

	const namedSkins = skinNames.filter((name) => name !== DEFAULT_SKIN_NAME);

	// The base `default` skin is usually an incomplete base, so exclude it once
	// real named skins exist; keep it when it is all the skeleton has.
	return namedSkins.length > 0 ? namedSkins : [DEFAULT_SKIN_NAME];
}

function selectRequestedSkins(input: EnumerateVariationsInput, requested: string[]): string[] {
	for (const name of requested) {
		if (!input.skinNames.includes(name)) {
			throw new SpineSelectionError({
				availableNames: input.skinNames,
				code: "missing-selection",
				message: `Unknown skin "${name}" in ${input.skeletonPath}.`,
				requestedName: name,
				selectionType: "skin",
				skeletonPath: input.skeletonPath,
			});
		}
	}

	// Honour skeleton-declared order (and dedupe repeats) even for a subset, so
	// the run stays deterministic no matter how the flags were ordered. An
	// explicit `default` survives here — the exclusion rule only governs the
	// automatic set.
	return input.skinNames.filter((name) => requested.includes(name));
}
