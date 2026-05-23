# spine2img

Render a Spine JSON animation to an APNG file from Node.js or the command line.

## API

```ts
import { renderSpine } from "spine2img";

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
```

When `format` is omitted, the library infers it from `outputPath`: `.webp` writes WebP, while `.png` and `.apng` write APNG. Unrecognized extensions still fall back to `"apng"`. When `fps` is omitted, rendering defaults to `30`. When `width` and `height` are omitted, the output auto-fits the animation bounds. Backgrounds stay transparent unless you pass a hex `backgroundColor`. Existing output files are protected by default; pass `overwrite: true` to replace them intentionally.

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

The CLI also infers the format from the output extension, and `--format` overrides that inference. For automation, ask the CLI for the same structured result metadata as JSON:

```bash
spine2img render fixtures/tracer-bullet/box.json out/box.apng --json
```

```json
{ "format": "apng", "outputPath": "out/box.apng", "animationName": "pulse", "fps": 30 }
```

Without `--overwrite`, the CLI fails if `out/box.apng` already exists.

## Development

```bash
pnpm check --fix
pnpm test
```
