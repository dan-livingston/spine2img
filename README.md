# spine2img

Render a Spine JSON animation to an APNG file from Node.js or the command line.

## API

```ts
import { renderSpineToApng } from "spine2img";

await renderSpineToApng({
	skeletonPath: "fixtures/tracer-bullet/box.json",
	atlasPath: "fixtures/tracer-bullet/box.atlas",
	outputPath: "out/box.apng",
});
```

## CLI

```bash
spine2img render fixtures/tracer-bullet/box.json fixtures/tracer-bullet/box.atlas out/box.apng
```

## Development

```bash
pnpm test
pnpm build
pnpm check
```
