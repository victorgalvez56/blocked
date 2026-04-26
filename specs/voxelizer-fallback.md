# Spec — Client-Side Deterministic Voxelizer (Fallback)

**Status:** Draft
**Owner:** TBD
**Depends on:** `specs/ai-pipeline.md` (defines `VoxelGrid`), `data/lego-palette.json`
**Companion to:** `PROJECT_BRIEF.md`

## 0. Purpose & Scope

The product's "magic moment" path is text → DALL·E 3 → GPT-4o → `VoxelGrid`. That path can fail in three ways:
1. The model API is unavailable (network, quota, outage).
2. GPT-4o returns a `VoxelGrid` that fails validation (off-palette colors, floating voxels, wrong dimensions).
3. The user uploads their own image and skips AI generation entirely.

For all three cases, we need a deterministic, fully client-side voxelizer that takes an image (or up to four images) and produces a valid `VoxelGrid` snapped to the official Lego palette. This module is the spiritual successor to the `brick-lab.html` prototype referenced in `PROJECT_BRIEF.md`.

Non-goals:
- Photorealistic 3D reconstruction. Visual hull is "good enough for blocky figures."
- Multi-material output. Voxels are colored by a single Lego palette entry.
- GPU compute. CPU-only, Web Worker, must work on a mid-range laptop without WebGPU.

---

## 1. Algorithm: Single-View Image → Bas-Relief Voxel Grid

### 1.1 Inputs / Outputs

```ts
function voxelizeImage(
  imageData: ImageData,
  palette: LegoColor[],
  opts: {
    maxDimension: number;        // default 24, must be in [8, 32]
    depthMode: 'flat' | 'luminance' | 'edge-aware';
    maxDepth?: number;           // default 8, max layers in Z
    backgroundThreshold?: number;// default 0.95 (alpha or luminance) — pixels above this are transparent
  }
): VoxelGrid;
```

`VoxelGrid` is the type defined in `specs/ai-pipeline.md`:

```ts
type VoxelGrid = {
  dimensions: { x: number; y: number; z: number };
  voxels: Array<{ x: number; y: number; z: number; colorId: string }>;
  paletteVersion: string;
};
```

### 1.2 High-level pipeline

```
ImageData (any size)
   ↓ resize (OffscreenCanvas, bilinear)
ImageData (W × H, where max(W,H) = maxDimension)
   ↓ background mask (alpha channel OR luminance threshold)
foreground mask (W × H, boolean)
   ↓ palette quantize (per pixel)
colorId grid (W × H, string | null)
   ↓ depth function (depthMode)
depth grid (W × H, int 1..maxDepth)
   ↓ extrude to 3D
VoxelGrid
```

### 1.3 Coordinate mapping

We map the 2D image to the XY plane of the voxel grid, with depth extruded along Z:
- Image x-axis → grid X (0 .. W-1)
- Image y-axis (flipped, since image y grows down) → grid Y (0 .. H-1)
- Depth → grid Z (0 .. depth-1)

Y=0 is the bottom row; baseplate convention from `brick-lab.html`. The base of the figure rests on Y=0 in 3D space (the user's table).

**Open question:** PROJECT_BRIEF talks about voxels resting on a "baseplate." We need to decide whether the 2D image's bottom row maps to grid Y=0 (the baseplate) or whether we add a 1-row baseplate underneath. Recommendation: do **not** add a baseplate in the voxelizer; that's an editor concern.

### 1.4 Resize step

Use `OffscreenCanvas` inside the worker. Strategy:
1. Compute target size: if `srcW >= srcH`, then `tgtW = maxDimension`, `tgtH = round(maxDimension * srcH / srcW)`. Otherwise the inverse.
2. Draw the source `ImageBitmap` onto an `OffscreenCanvas(tgtW, tgtH)` with `imageSmoothingQuality = 'high'` (browser uses bilinear or better).
3. `ctx.getImageData(0, 0, tgtW, tgtH)` → `Uint8ClampedArray` of RGBA.

### 1.5 Background masking

A pixel is "background" (not voxelized) if any of:
- `alpha < 16` (transparent), OR
- `depthMode != 'flat'` AND luminance > `backgroundThreshold` AND saturation < 0.05 (white-ish background)

Otherwise, the pixel is foreground and gets a voxel.

### 1.6 Per-pixel palette quantization

For each foreground pixel, call `nearestLegoColor(rgb, palette)` (see §3). Cache per-pixel results — there are at most `maxDimension²` ≈ 576 lookups, no need for fancy KD-trees.

### 1.7 depthMode pseudocode

#### 1.7.1 `flat`

```
for each foreground pixel (px, py):
  depth[px][py] = 1
```
All voxels are a single layer thick. Equivalent to a 2D mosaic with z=0.

#### 1.7.2 `luminance`

Brighter pixels protrude more. (For dark figures, invert.)

```
L = perceptual luminance of pixel, in [0, 1]
                       // L = 0.2126*R + 0.7152*G + 0.0722*B (sRGB)
foregroundMeanL = mean luminance over foreground pixels
invert = (foregroundMeanL > 0.6)   // if image is mostly bright, dark = high relief

for each foreground pixel (px, py):
  L_norm = invert ? (1 - L) : L
  depth[px][py] = clamp(1, maxDepth, 1 + round(L_norm * (maxDepth - 1)))
```

#### 1.7.3 `edge-aware`

Depth is high near edges, low in flat interior regions. This produces a more sculpted look — the silhouette is preserved at full depth, interior details flatten.

```
1. luminance map L[px][py] for all pixels
2. sobel edge magnitude E[px][py] (3×3 Sobel on L)
3. distance transform from non-foreground pixels: D[px][py] = distance to nearest non-foreground pixel
                                                  (Euclidean, computed via 2-pass Felzenszwalb)
4. for each foreground pixel:
     # silhouette voxels (D=1, on the edge) get max depth
     # deep-interior voxels can fall back to luminance
     if D[px][py] <= 1:
       depth = maxDepth
     else:
       L_norm = perceptual luminance, possibly inverted (see luminance mode)
       edge_boost = clamp(E[px][py] / E_max, 0, 1)
       depth = 1 + round( ((L_norm * 0.6) + (edge_boost * 0.4)) * (maxDepth - 1) )
```

### 1.8 Extrusion to 3D

```
voxels = []
for py in 0..H-1:
  for px in 0..W-1:
    if not foreground[px][py]: continue
    colorId = quantized[px][py]
    d = depth[px][py]
    for z in 0..d-1:
      voxels.push({
        x: px,
        y: (H - 1 - py),   // flip vertical: image-top = grid-top
        z,
        colorId,
      })

return {
  dimensions: { x: W, y: H, z: maxDepth },
  voxels,
  paletteVersion: palette.version,
}
```

Result: a bas-relief voxelization. Front face at z=0 is the silhouette; figure extrudes "into the screen" along +Z.

### 1.9 Edge cases

- **All-transparent image:** return an empty `VoxelGrid` (zero voxels). Caller must handle "nothing to build."
- **Fewer than 8 foreground pixels:** treat as empty (likely junk input).
- **Single-color foreground:** still works; depth modes degenerate gracefully.
- **Tall portrait vs wide landscape:** non-square images produce non-square grids; that's fine — `dimensions.x != dimensions.y` is allowed.

---

## 2. Algorithm: 4-View Image Set → True 3D Figure (Visual Hull)

### 2.1 Inputs / Outputs

```ts
function voxelizeMultiView(
  views: {
    front: ImageData;
    side: ImageData;   // right side (camera looking down -X)
    back: ImageData;
    top: ImageData;    // camera looking down -Y
  },
  palette: LegoColor[],
  opts: {
    gridSize: number;            // default 24, cubic voxel grid
    backgroundThreshold?: number;
    colorSampleStrategy?: 'front-only' | 'weighted-average';
  }
): VoxelGrid;
```

We assume the four views have been generated to be mutually consistent — same subject, centered, fills the frame, plain background. DALL·E 3 can be prompted to deliver these (see `specs/ai-pipeline.md`).

### 2.2 Camera convention

Let the voxel grid be `[0, N) × [0, N) × [0, N)` in `(X, Y, Z)`. Cameras are orthographic, axis-aligned:

| View    | Camera looks along | Image x maps to | Image y (top→bottom) maps to |
|---------|--------------------|-----------------|------------------------------|
| front   | +Z (toward -Z)     | grid X          | grid -Y (image top = +Y)     |
| side    | -X (toward +X)     | grid -Z         | grid -Y                      |
| back    | -Z (toward +Z)     | grid -X         | grid -Y                      |
| top     | -Y (toward +Y)     | grid X          | grid +Z                      |

Each view, after silhouette extraction, is an `N × N` binary mask.

### 2.3 Pipeline

```
1. For each of the 4 views:
     resize to N × N (preserving aspect; pad with background if needed)
     compute foreground mask (same logic as §1.5)
     → silhouette[view]: bool[N][N]

2. Init occupancy: voxel[x][y][z] = true   ∀ (x,y,z)

3. For each voxel (x, y, z):
     for each view in {front, side, back, top}:
       (u, v) = project_onto_view(view, x, y, z)
       if not silhouette[view][u][v]:
         voxel[x][y][z] = false
         break

4. Color step (per surviving voxel):
     if colorSampleStrategy == 'front-only':
       (u, v) = project_onto_view('front', x, y, z)
       rgb = sourceImage['front'][u][v]
       colorId = nearestLegoColor(rgb, palette)
     else:  // weighted-average
       collect (rgb, weight) for each view where voxel is on the silhouette boundary
       (weight inversely proportional to distance-from-surface in that view)
       blend → rgb_avg
       colorId = nearestLegoColor(rgb_avg, palette)

5. Build VoxelGrid:
     voxels = [{x, y, z, colorId} for each surviving voxel]
     dimensions = { x: N, y: N, z: N }
```

Recommendation: ship `'front-only'` first. It's faster, debuggable, and consistent with the user's mental model ("the front is what I described"). Ship `'weighted-average'` later if users complain about wrong-color back faces.

### 2.4 Projection helpers

```
project_onto_view(view, x, y, z):
  switch view:
    case 'front':  return (x, N-1-y)
    case 'side':   return (N-1-z, N-1-y)
    case 'back':   return (N-1-x, N-1-y)
    case 'top':    return (x, z)
```

(Image y is flipped because image (0,0) is top-left, grid (0,0,0) is bottom-front-left.)

### 2.5 Limitation acknowledged

**Visual hull cannot recover concave geometry.** A donut becomes a solid disk; an open-mouthed dragon's mouth fills in. This is a known and accepted tradeoff: Lego figures are blocky, the BOM target is 100–300 pieces, and concavities at this resolution are mostly invisible. If we ever need true concavity, the path is silhouette-from-depth (depth maps from each view) — out of scope for v1.

### 2.6 Performance note

Naive `O(N³ × 4)` voxel checks at N=24 = 55,296 voxel-view checks. Trivially fast. The expensive bit is image resize + silhouette extraction (4× the single-view cost). See §5.

---

## 3. Color Quantization to Lego Palette

### 3.1 Palette source

`/data/lego-palette.json` (must be added to the repo). Expected schema:

```json
{
  "version": "2026.01",
  "colors": [
    { "id": "5", "name": "Red", "rgb": [196, 40, 28], "bricklinkId": 5, "transparent": false, "available": true },
    { "id": "1", "name": "White", "rgb": [242, 243, 242], "bricklinkId": 1, "transparent": false, "available": true },
    ...
  ]
}
```

Only `available: true` colors are eligible. `transparent` colors are excluded by default for voxelizer output (most figures use opaque colors; transparency is an editor-only concern).

### 3.2 Two distance metrics

```ts
type LegoColor = { id: string; name: string; rgb: [number, number, number]; ... };

function nearestLegoColor(
  rgb: [number, number, number],
  palette: LegoColor[],
  metric: 'ciede2000' | 'weighted-rgb' = 'ciede2000'
): string;  // returns colorId
```

### 3.3 CIEDE2000 (recommended for one-shot quantization)

Perceptually uniform, accurate, slow. Use for:
- Voxelizer fallback output (one-shot, ~600 pixels max → fine)
- AI-generated `VoxelGrid` re-validation (when GPT-4o emits an off-palette color, snap it)
- BOM finalization

Pseudocode:
```
nearestLegoColor_ciede2000(rgb, palette):
  lab_in = rgbToLab(rgb)
  best = (∞, null)
  for color in palette where available:
    lab_c = rgbToLab(color.rgb)         // precomputed at palette load time
    d = ciede2000(lab_in, lab_c)
    if d < best.dist: best = (d, color.id)
  return best.id
```

`ciede2000` is the standard formula (Sharma 2005 reference impl). Roughly 80 floating-point ops per call. Precompute LAB for every palette color once.

### 3.4 Weighted RGB (recommended for real-time editor brush)

Fast, "good enough." Use for:
- Live brush in the editor (must respond in <16ms per stroke)
- Eyedropper preview
- Hover tooltips

```
nearestLegoColor_weightedRgb(rgb, palette):
  best = (∞, null)
  for color in palette where available:
    dr = rgb[0] - color.rgb[0]
    dg = rgb[1] - color.rgb[1]
    db = rgb[2] - color.rgb[2]
    rmean = (rgb[0] + color.rgb[0]) / 2
    // "low-cost" perceptual approximation, https://www.compuphase.com/cmetric.htm
    d = sqrt( ((512 + rmean) * dr * dr) >> 8
            + 4 * dg * dg
            + ((767 - rmean) * db * db) >> 8 )
    if d < best.dist: best = (d, color.id)
  return best.id
```

### 3.5 Recommendation

The voxelizer fallback uses **CIEDE2000** by default. The editor brush uses **weighted-RGB**. Expose both via the `metric` param so users (and tests) can compare.

---

## 4. Validation Function

### 4.1 Signature

```ts
type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] };

type ValidationError =
  | { code: 'unknown_color';     voxel: Voxel; offending: string }
  | { code: 'floating_voxel';    voxel: Voxel }
  | { code: 'voxel_above_max_y'; voxel: Voxel; max: number }
  | { code: 'dimensions_out_of_range'; axis: 'x' | 'y' | 'z'; value: number; min: number; max: number }
  | { code: 'duplicate_voxel';   voxel: Voxel };

function validateVoxelGrid(
  grid: VoxelGrid,
  palette: LegoColor[],
  opts?: { strictGravity?: boolean; minDim?: number; maxDim?: number }
): ValidationResult;
```

Defaults: `strictGravity=true`, `minDim=8`, `maxDim=32`.

### 4.2 Checks (in order, fast-fail OFF — collect all errors)

1. **Dimensions in range:** `dimensions.x`, `.y`, `.z` ∈ [`minDim`, `maxDim`]. Else emit `dimensions_out_of_range`.
2. **Build a 3D occupancy set** keyed by `"x,y,z"`. Detect duplicates → `duplicate_voxel`.
3. **Bounds:** every voxel in [0, dim-1] per axis. Out of bounds → `voxel_above_max_y` (also covers other axes; rename if needed).
4. **Palette membership:** every `colorId` exists in `palette` and `available: true`. Else `unknown_color`.
5. **Gravity (strictGravity):** for each voxel `(x, y, z)`, if `y > 0` then `(x, y-1, z)` must also be occupied. Otherwise emit `floating_voxel`. Voxels with `y == 0` rest on the implicit baseplate.
6. Return `{ ok: true }` if no errors, else `{ ok: false, errors }`.

### 4.3 Usage matrix

| Caller                         | strictGravity | Notes |
|--------------------------------|---------------|-------|
| Server-side AI output gate     | `true`        | If invalid → trigger fallback voxelizer on the DALL·E reference image. |
| Voxelizer fallback (self-test) | `true`        | Should never fail; if it does, log + raise alert. |
| Client-side editor (mid-edit)  | `false`       | User can place floating voxels temporarily; only enforce on BOM export. |
| Client-side BOM export         | `true`        | Block export until valid. |

### 4.4 Open question

Should we treat **disconnected components** as invalid? E.g., a figure that is two unconnected blobs sitting on the baseplate. The brief says "buildable for real," but two separate pieces sitting on the same baseplate are still buildable. Recommend: not a validation error; surface it as a warning in the editor.

---

## 5. Performance Budget

### 5.1 Targets

| Operation                                | Target (mid-range laptop, M1 / Intel i5 2020+) |
|------------------------------------------|------------------------------------------------|
| Single-view voxelize, 24×24×8, edge-aware | < 500 ms                                       |
| Multi-view voxelize, 24³, 4 inputs        | < 2000 ms                                      |
| `nearestLegoColor` CIEDE2000, single call | < 0.2 ms (palette ~70 colors)                  |
| `validateVoxelGrid`, 5,000 voxels         | < 50 ms                                        |
| Editor brush quantize (weighted-RGB)      | < 0.05 ms                                      |

### 5.2 Where the time goes (single-view, 24×24×8)

| Step                              | Estimated cost |
|-----------------------------------|----------------|
| ImageBitmap decode + resize       | ~80 ms         |
| getImageData                      | ~5 ms          |
| Foreground mask                   | ~3 ms          |
| Palette quantize (576 px CIEDE2000) | ~50 ms       |
| Edge-aware depth (Sobel + DT)     | ~100 ms        |
| Extrude + serialize               | ~10 ms         |
| Total                             | ~250 ms        |

Comfortable headroom. The dominant cost is image decode; everything after is microseconds.

### 5.3 Web Worker API

The voxelizer runs in a dedicated Web Worker (`/lib/voxelizer/worker.ts`). Main thread never blocks on it.

```ts
// types in /lib/voxelizer/types.ts
type VoxelizerRequest =
  | { id: string; kind: 'single';      image: ImageBitmap;                     opts: SingleOpts }
  | { id: string; kind: 'multi';       images: { front: ImageBitmap; side: ImageBitmap; back: ImageBitmap; top: ImageBitmap }; opts: MultiOpts }
  | { id: string; kind: 'validate';    grid: VoxelGrid;                        opts?: ValidateOpts }
  | { id: string; kind: 'quantize';    rgb: [number, number, number];          metric: 'ciede2000' | 'weighted-rgb' };

type VoxelizerResponse =
  | { id: string; ok: true;  result: VoxelGrid | ValidationResult | string /* colorId */ }
  | { id: string; ok: false; error: string };

// main thread:
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const bitmap = await createImageBitmap(file);
worker.postMessage(
  { id: 'r1', kind: 'single', image: bitmap, opts: { maxDimension: 24, depthMode: 'edge-aware' } },
  [bitmap]   // transfer, not copy
);
worker.onmessage = (e) => { /* dispatch by id */ };
```

Notes:
- **Transfer `ImageBitmap`** rather than copy `ImageData`. Bitmap is decoded once, then handed to the worker zero-copy.
- The worker uses `OffscreenCanvas` (well supported in Chrome, Safari 16.4+, Firefox 105+) to do the resize and pixel extraction without a DOM.
- Palette is loaded once at worker init (fetch `/data/lego-palette.json`, precompute LAB).
- All responses are keyed by `id` so the main thread can multiplex multiple in-flight requests (rare, but supported).

### 5.4 OffscreenCanvas decision

**Yes, use OffscreenCanvas** in the worker for image decode/resize. Rationale: keeps the main thread free for rendering the editor at 60fps during voxelization, and is the cleanest way to call `drawImage` + `getImageData` off-thread. Fallback for old browsers: detect at startup, run voxelizer on the main thread inside `requestIdleCallback` chunks. Gracefully degraded performance, but still functional.

---

## 6. File Layout

All under `/lib/voxelizer/`:

```
lib/voxelizer/
├── index.ts                # public API surface (re-exports + main-thread proxy)
├── types.ts                # VoxelGrid (re-export from /lib/types), LegoColor, ValidationResult,
│                           # VoxelizerRequest/Response, internal types
├── image-to-grid.ts        # voxelizeImage() — single-view bas-relief (§1)
│                           # depth modes: flat, luminance, edge-aware
│                           # exports: voxelizeImage, computeDepthMap, applyForegroundMask
├── multi-view-hull.ts      # voxelizeMultiView() — silhouette intersection (§2)
│                           # exports: voxelizeMultiView, projectOntoView, sampleVoxelColor
├── color-quantize.ts       # nearestLegoColor() with both metrics (§3)
│                           # exports: nearestLegoColor, rgbToLab, ciede2000,
│                           #          weightedRgbDistance, precomputePaletteLab
├── image-ops.ts            # shared utilities: resize via OffscreenCanvas,
│                           # luminance map, sobel edges, distance transform,
│                           # foreground masking
├── validate.ts             # validateVoxelGrid() (§4)
│                           # exports: validateVoxelGrid, ValidationResult, ValidationError
├── worker.ts               # Web Worker entry: routes Request → handlers, posts Response
├── client.ts               # main-thread proxy: spawns worker, exposes Promise-based API
│                           # exports: VoxelizerClient (class), defaultClient
├── palette-loader.ts       # fetch + parse /data/lego-palette.json, precompute LAB
└── __tests__/
    ├── image-to-grid.test.ts
    ├── multi-view-hull.test.ts
    ├── color-quantize.test.ts
    ├── validate.test.ts
    └── fixtures/
        ├── checker-24.png
        ├── dragon-front.png
        ├── dragon-side.png
        ├── dragon-back.png
        └── dragon-top.png
```

### 6.1 Public API (`index.ts`)

```ts
export { VoxelizerClient, defaultClient } from './client';
export { validateVoxelGrid } from './validate';
export { nearestLegoColor } from './color-quantize';
export type {
  VoxelGrid, LegoColor, ValidationResult, ValidationError,
  SingleOpts, MultiOpts,
} from './types';
```

The voxelizer is consumed by the rest of the app **only** through `index.ts`. Direct imports from `image-to-grid.ts` etc. are forbidden (lint rule).

### 6.2 Server-side reuse

`validate.ts` and `color-quantize.ts` are pure, deterministic, no DOM dependencies → reusable in the Node server (the AI output gate). `image-to-grid.ts`, `multi-view-hull.ts`, `image-ops.ts`, and `worker.ts` are browser-only (require `OffscreenCanvas` / `ImageBitmap`). If we ever need server-side fallback voxelization, swap `OffscreenCanvas` for `sharp` or `node-canvas` behind a thin abstraction in `image-ops.ts`.

---

## 7. Test Plan (high-level)

- **Unit:** every `nearestLegoColor` returns a known answer for ~20 hand-picked RGB inputs.
- **Unit:** `validateVoxelGrid` catches each error class in isolation.
- **Golden:** `voxelizeImage('checker-24.png', 'flat')` → exact voxel-count match across runs.
- **Golden:** multi-view dragon set → snapshot of voxel count and bounding box.
- **Performance:** budget asserted via `performance.now()` with ±20% tolerance, run on CI.
- **Property:** `voxelizeImage` output always passes `validateVoxelGrid` with `strictGravity=true`. (This is a strong invariant — if it fails, the algorithm has a bug.)

---

## 8. Open Questions

1. **Palette source:** does `/data/lego-palette.json` already exist? If yes, what's the schema? If no, we need to commit one — propose lifting from BrickLink's color reference (~70 currently-produced colors).
2. **Baseplate:** does the voxelizer emit a baseplate row (Y=0 = a row of plate voxels) or does the editor add it? Recommendation: editor adds it; voxelizer outputs only the figure.
3. **Color sample strategy** for multi-view: ship `front-only` v1, defer `weighted-average` until we see real failure cases?
4. **Disconnected-component validation:** treat as invalid, warning, or ignored? Recommendation: warning (not blocking).
5. **Transparent palette colors:** opt-in via `opts.allowTransparent` or completely excluded from the voxelizer? Recommendation: excluded; users add transparency manually in the editor.
6. **Background detection robustness:** simple alpha+luminance thresholding will fail on busy backgrounds (DALL·E sometimes adds gradients). Do we need a `removeBackground()` step (e.g., `@imgly/background-removal`) before voxelizing user uploads? Punt to v2 and require "plain background" in the upload UI for v1.
7. **Aspect ratio:** what if the user uploads a very wide (3:1) image? Crop to square, or produce a 32×11 grid? Recommendation: preserve aspect ratio up to `maxDim`, then the figure is non-square. Editor handles the resulting non-cubic grid.
8. **Worker fallback:** is there a graceful fallback if `OffscreenCanvas` is unsupported, or do we just block users on Safari < 16.4? Recommendation: feature-detect, fall back to main-thread + idle callbacks, log a warning.
