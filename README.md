# spine2img

Render a Spine JSON animation to an APNG file from Node.js or the command line.

## API

```ts
import { renderSpineToApng } from "spine2img";

const result = await renderSpineToApng({
	animationName: "pulse",
	skeletonPath: "fixtures/tracer-bullet/box.json",
	atlasPath: "fixtures/tracer-bullet/box.atlas",
	outputPath: "out/box.apng",
	fps: 24,
});

console.log(result.fps); // 24
console.log(result.frameCount); // structured metadata for automation
```

When `fps` is omitted, rendering defaults to `30`.

## CLI

```bash
spine2img render fixtures/tracer-bullet/box.json out/box.apng \
  --atlas fixtures/tracer-bullet/box.atlas \
  --animation pulse \
  --fps 24
```

For automation, ask the CLI for the same structured result metadata as JSON:

```bash
spine2img render fixtures/tracer-bullet/box.json out/box.apng --json
```

```json
{ "format": "apng", "outputPath": "out/box.apng", "animationName": "pulse", "fps": 30 }
```

## Development

```bash
pnpm test
pnpm build
pnpm check
```
