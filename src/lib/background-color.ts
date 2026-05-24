export function normalizeBackgroundColor(backgroundColor: string | undefined): string | undefined {
	if (backgroundColor === undefined) {
		return undefined;
	}

	const normalized = backgroundColor.trim();
	const hexMatch = /^#(?<hex>[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(normalized);

	if (!hexMatch?.groups?.hex) {
		throw new Error(
			`backgroundColor must be a hex color like #rgb, #rgba, #rrggbb, or #rrggbbaa. Received ${backgroundColor}.`,
		);
	}

	const hex = hexMatch.groups.hex;
	const expanded =
		hex.length === 3 || hex.length === 4
			? Array.from(hex, (character) => `${character}${character}`).join("")
			: hex;
	const red = Number.parseInt(expanded.slice(0, 2), 16);
	const green = Number.parseInt(expanded.slice(2, 4), 16);
	const blue = Number.parseInt(expanded.slice(4, 6), 16);
	const alphaByte = expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) : 255;

	return `rgba(${red}, ${green}, ${blue}, ${Number((alphaByte / 255).toFixed(3))})`;
}
