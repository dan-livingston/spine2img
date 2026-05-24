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
	"loop": 0,
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
	"loop": 0,
	"lossless": false,
	"quality": 80
}
```

Without `--overwrite`, the CLI fails if the output path already exists.

## Looping

By default every output loops forever — the same behavior as before. To play an animation a fixed number of times, set a **loop count**: `0` means infinite (the default), `1` plays once and rests on the final frame, and `N` plays exactly `N` times. This is the format's own loop count (APNG's `acTL` `num_plays`, WebP's loop field), so it behaves identically for both formats and is reported back on the result as `loop`.

A single render targets one animation, so it takes a plain scalar count — `loop` in the library and `--loop` on the CLI:

```ts
const result = await renderSpine({
	skeletonPath: "fixtures/tracer-bullet/box.json",
	outputPath: "out/press.webp",
	loop: 1, // play once, then hold the end pose
});

console.log(result.loop); // 1
```

```bash
spine2img render fixtures/tracer-bullet/box.json out/press.webp --loop 1
```

`loop` is the one knob for both seamless loops and one-shots: leave it at the `0` default for a seamless idle/hover that returns to its start pose, and set `1` for a one-shot whose end pose differs from its start so it does not visibly snap back on every cycle. An invalid count (negative, fractional, `NaN`, or `Infinity`) is rejected up front with a typed `RenderOptionValidationError`. For a single-frame animation the option is inert — there is nothing to loop, so a still image is written unchanged.

## Batch rendering

A single render handles one animation. To export every state of a skeleton at once — for example all of a UI button's idle/hover/press animations across its skins — use the `renderSpineVariations` library function or the `spine2img render-all` CLI subcommand. Both render the full cross-product of **all animations × all skins** in one invocation, loading the skeleton, atlas, and textures once and rendering strictly sequentially to keep memory bounded.

```ts
import { renderSpineVariations } from "spine2img";

const result = await renderSpineVariations({
	skeletonPath: "fixtures/render-all/button.json",
	atlasPath: "fixtures/render-all/button.atlas",
	outputDir: "out/button",
	format: "apng",
	overwrite: true,
});

console.log(result.skinNames); // ["alt", "wide"] — the skins actually rendered
console.log(result.succeeded.length); // 6 (3 animations × 2 skins)
console.log(result.failed); // [] when everything rendered
```

```bash
spine2img render-all fixtures/render-all/button.json out/button \
  --atlas fixtures/render-all/button.atlas \
  --overwrite
```

The skeleton in the example carries three animations (`idle`, `hover`, `press`) and two named skins (`alt`, `wide`), so the run writes six files and streams one progress line per variation followed by a summary:

```
Rendered alt/idle to out/button/alt/idle.apng (65x62, 30 frames @ 30 fps).
Rendered alt/hover to out/button/alt/hover.apng (65x62, 15 frames @ 30 fps).
Rendered alt/press to out/button/alt/press.apng (65x62, 8 frames @ 30 fps).
Rendered wide/idle to out/button/wide/idle.apng (129x62, 30 frames @ 30 fps).
Rendered wide/hover to out/button/wide/hover.apng (129x62, 15 frames @ 30 fps).
Rendered wide/press to out/button/wide/press.apng (129x62, 8 frames @ 30 fps).
Rendered 6 variations to out/button.
```

Every variation in a skin shares one canvas size (`alt` at `65x62`, `wide` at `129x62`) — that is the registered canvas at work — while the per-animation frame counts differ.

### Skins and the cross-product

`render-all` always renders **every** animation; the animation axis has no subset selector. Skins are the axis you narrow. By default the skin set is the skeleton's named skins, **excluding** the base `default` skin when named skins exist (so you do not get a directory of likely-incomplete base-only renders). If `default` is the only skin, it is used. If the skeleton has no skins at all, animations render skinless.

Narrow the run to specific skins with a repeatable `--skin` flag (CLI) or a `skinNames` array (library). An unknown requested skin fails the whole run up front with a typed `SpineSelectionError`. `--skin default` forces the base skin explicitly, overriding the exclusion rule.

```bash
# Render only the "alt" skin's animations.
spine2img render-all fixtures/render-all/button.json out/button \
  --atlas fixtures/render-all/button.atlas \
  --skin alt
```

```ts
const result = await renderSpineVariations({
	skeletonPath: "fixtures/render-all/button.json",
	outputDir: "out/button",
	skinNames: ["alt", "wide"], // omit or leave empty for every named skin
});
```

### Output layout

Files are written to `<outDir>/<skin>/<animation>.<ext>`, a collision-proof layout that groups each skin's states together. A `/` within an animation or skin name is preserved as real nested directories (Spine's own grouping convention); a `..` or absolute segment is rejected so a malformed asset name can never write outside `<outDir>`. A skinless skeleton degenerates to a flat `<outDir>/<animation>.<ext>` with no skin segment.

Because the target is a directory with no extension to infer from, the format is `--format` / `format` if given and otherwise **APNG**. One format applies to the whole run — a batch is all-APNG or all-WebP — and generated files use the matching `.apng` or `.webp` extension. The lossless/quality options behave exactly as for single render: WebP is lossless by default, `--no-lossless` opts into lossy WebP, and `--quality` (0–100, default 80) applies only to lossy WebP.

### Registered canvas and `--tight`

By default every animation in a skin renders on a uniform, **registered** canvas: the union of that skin's animation bounds with a shared origin offset, so all of a skin's states come out identically sized and pixel-aligned and can be swapped in a UI without any layout shift. The union is computed per skin (skins may legitimately differ in extent) via a cheap pose-only measure pass that retains no frame buffers.

Pass `--tight` (CLI) / `tight: true` (library) to opt back into per-animation auto-fit, producing minimal individual sprites at the cost of registration. Explicit `--width`/`--height` override sizing entirely and apply uniformly to every output.

```bash
# Render WebP, lossy, with minimal per-animation sprites.
spine2img render-all fixtures/render-all/button.json out/button \
  --atlas fixtures/render-all/button.atlas \
  --format webp \
  --no-lossless \
  --quality 80 \
  --tight
```

The shared options — `--fps`, `--background`, `--width`/`--height`, `--format`, `--no-lossless`, `--quality`, and `--overwrite` — all apply uniformly to every variation in the run.

### Failure model and exit codes

The failure model is split between problems that should stop the run and problems that should not.

**Shared, upfront problems fail fast before any rendering happens:** a missing skeleton, atlas, or texture; an unknown requested skin; invalid options (such as a bad fps, dimension, or a `--quality`/`--no-lossless` request on a non-WebP run); a skeleton with zero animations; and — unless `--overwrite` is set — any pre-existing target file. The collision check is a single gate computed over the whole set of target paths, so you never render dozens of files and then halt partway on a conflict. `--overwrite` replaces each target; the command never deletes files it did not generate.

**Isolated per-variation failures are collected, not fatal:** if one animation fails to render, encode, or write, the failure is recorded and the run continues so a single flaky variation does not cost you the whole batch. The library function still resolves normally — inspect the `failed` array to see what went wrong. The CLI prints each failure to stderr and sets a **non-zero exit code** when any variation failed, so CI detects a partial batch without parsing output.

### `--json` and the result shape

`renderSpineVariations` returns a structured summary. Each entry in `succeeded` is the same result shape a single `renderSpine` returns (so there is one metadata vocabulary across the tool); each entry in `failed` carries the typed error plus the skin, animation, and path it belongs to.

```ts
interface RenderSpineVariationsResult {
	outputDir: string;
	format: "apng" | "webp";
	lossless: boolean;
	quality?: number; // only when lossy WebP
	skinNames: string[]; // skins actually rendered, in skeleton-declared order
	durationMs: number; // whole-run wall time
	succeeded: RenderSpineResult[];
	failed: {
		skinName?: string;
		animationName: string;
		outputPath: string;
		error: Error;
	}[];
}
```

The CLI emits that same summary as JSON under `--json`, which suppresses the per-variation progress chatter so machine consumers get clean stdout:

```bash
spine2img render-all fixtures/render-all/button.json out/button \
  --atlas fixtures/render-all/button.atlas \
  --skin alt \
  --json
```

```json
{
	"outputDir": "out/button",
	"format": "apng",
	"lossless": true,
	"skinNames": ["alt"],
	"durationMs": 412,
	"succeeded": [
		{
			"animationName": "idle",
			"skinName": "alt",
			"outputPath": "out/button/alt/idle.apng",
			"format": "apng",
			"fps": 30,
			"frameCount": 30,
			"width": 65,
			"height": 62,
			"lossless": true
		}
	],
	"failed": []
}
```

In the JSON output each failure's `error` is serialized to `{ name, code, message }`, where `code` is the typed error code for known render errors.

## Development

```bash
pnpm check --fix
pnpm test
```
