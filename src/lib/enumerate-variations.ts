export interface BatchVariation {
	animationName: string;
	skinName?: string;
}

export interface EnumerateVariationsInput {
	animationNames: string[];
	skinNames: string[];
}

const DEFAULT_SKIN_NAME = "default";

// Tracer-bullet scope: every animation of the sole/default skin, in skeleton-
// declared order. The full animations × skins cross-product, the default-skin
// exclusion rule, the skinless fallback, and skin-subset narrowing arrive in a
// later slice; this picks the single skin those rules will eventually generalise.
export function enumerateVariations(input: EnumerateVariationsInput): BatchVariation[] {
	const skinName = selectDefaultSkin(input.skinNames);

	return input.animationNames.map((animationName) => ({
		animationName,
		skinName,
	}));
}

function selectDefaultSkin(skinNames: string[]): string | undefined {
	if (skinNames.includes(DEFAULT_SKIN_NAME)) {
		return DEFAULT_SKIN_NAME;
	}

	// A skeleton with named skins but no `default`, or none at all (skinless).
	return skinNames[0];
}
