// The encoding decision, as a discriminated union: lossless, or lossy WebP at an
// effective quality. `resolveEncodeOptions` produces this and the render result
// surfaces it unchanged, so both derive from this single shape rather than
// declaring structurally identical copies that could drift apart.
export type LosslessEncoding = {
	lossless: true;
	quality?: never;
};

export type LossyWebpEncoding = {
	lossless: false;
	quality: number;
};

export type EncodingMetadata = LosslessEncoding | LossyWebpEncoding;
