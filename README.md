# spine2img

Render a Spine JSON animation to an APNG file from Node.js or the command line.

## API

```ts
import { renderSpineToApng } from "spine2img";

await renderSpineToApng({
	animationName: "pulse",
	skeletonPath: "fixtures/tracer-bullet/box.json",
	atlasPath: "fixtures/tracer-bullet/box.atlas",
	outputPath: "out/box.apng",
	skinName: "default",
});
```

## CLI

```bash
spine2img render fixtures/tracer-bullet/box.json out/box.apng \
  --atlas fixtures/tracer-bullet/box.atlas \
  --animation pulse \
  --skin default
```

## Development

```bash
pnpm test
pnpm build
pnpm check
```
