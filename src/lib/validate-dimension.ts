// Explicit width/height must be positive integers. Shared by single-render and
// batch so a bad dimension is rejected identically through either entry point.
export function validateExplicitDimension(
	name: "height" | "width",
	value: number | undefined,
): number | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${name} must be a positive integer. Received ${value}.`);
	}

	return value;
}
