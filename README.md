# spine2img

Render a Spine JSON animation to an APNG or WebP file from Node.js or the command line.

## API

```ts
import { renderSpine, renderSpineToWebp } from "spine2img";

const result = await renderSpine({
	animationName: "pulse",
	skeletonPath: "fixtures/tracer-bullet/box.json",
	atlasPath: "fixtures/tracer-bullet/box.atlas",
	outputPath: "out/box.apng",
	format: "apng",
	overwrite: true,
	fps: 24,
	width: 120,
	height: 80,
	backgroundColor: "#ffffff",
});

console.log(result.fps); // 24
console.log(result.format); // "apng"
console.log(result.frameCount); // structured metadata for automation
console.log(result.lossless); // true

const webpResult = await renderSpineToWebp({
	skeletonPath: "fixtures/tracer-bullet/box.json",
	atlasPath: "fixtures/tracer-bullet/box.atlas",
	outputPath: "out/box.webp",
	lossless: false,
	quality: 80,
});

console.log(webpResult.format); // "webp"
console.log(webpResult.quality); // 80 when lossy
```

`renderSpine` defaults to lossless output. For WebP, that means animated lossless WebP unless you opt into lossy output with `lossless: false`. Lossy WebP accepts `quality` from `0` to `100`, and defaults to `80` when omitted. `quality` is only valid for lossy WebP.

When `format` is omitted, the library infers it from `outputPath`: `.webp` writes WebP, while `.png` and `.apng` write APNG. Unrecognized extensions still fall back to `"apng"`. An explicit `format` always wins, even when it contradicts the output extension. The render result always includes `lossless`, and includes `quality` only for lossy WebP output. When `fps` is omitted, rendering defaults to `30`. When `width` and `height` are omitted, the output auto-fits the animation bounds. Backgrounds stay transparent unless you pass a hex `backgroundColor`. Existing output files are protected by default; pass `overwrite: true` to replace them intentionally.

Explicit `width`/`height` anchor the animation at the top-left of the canvas: a larger viewport pads the right and bottom, and a smaller viewport crops the right and bottom. The animation is not scaled or centered to fit.

## CLI

```bash
spine2img render fixtures/tracer-bullet/box.json out/box.apng \
  --atlas fixtures/tracer-bullet/box.atlas \
  --animation pulse \
  --format apng \
  --overwrite \
  --fps 24 \
  --width 120 \
  --height 80 \
  --background '#ffffff'
```

To render WebP instead, use a `.webp` output path or pass `--format webp`. WebP is lossless by default. Opt into lossy WebP with `--no-lossless`, and optionally set `--quality` from `0` to `100`:

```bash
spine2img render fixtures/tracer-bullet/box.json out/box.webp \
  --atlas fixtures/tracer-bullet/box.atlas \
  --animation pulse \
  --no-lossless \
  --quality 80
```

The CLI infers the format from the output extension: `.webp` writes WebP, while `.png` and `.apng` write APNG. Unrecognized extensions still fall back to APNG. `--format` overrides that inference, even if the extension says something else. `--quality` only applies to lossy WebP, and defaults to `80` when you pass `--no-lossless` without an explicit quality.

For automation, ask the CLI for the same structured result metadata as JSON:

```bash
spine2img render fixtures/tracer-bullet/box.json out/box.apng --json
```

```json
{
	"format": "apng",
	"outputPath": "out/box.apng",
	"animationName": "pulse",
	"fps": 30,
	"lossless": true
}
```

For lossy WebP output, the JSON result also includes `quality`:

```json
{
	"format": "webp",
	"outputPath": "out/box.webp",
	"animationName": "pulse",
	"fps": 30,
	"lossless": false,
	"quality": 80
}
```

Without `--overwrite`, the CLI fails if the output path already exists.

## Development

```bash
pnpm check --fix
pnpm test
```
