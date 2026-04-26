# AI Generation Pipeline Spec

**Status:** Draft v1
**Scope:** Phase 1 — "The Magic Moment" (text → buildable 3D Lego figure)
**Constraint:** OpenAI API key only. No 3D-specific provider (no Meshy, no Tripo, no Hunyuan, no Rodin). We fake 3D by combining DALL·E 3 (reference image) with GPT-4o vision + structured outputs (voxel grid JSON).

This document is the contract between the `/api/generate` route and everything downstream (the editor, the BOM, the gallery). If you change a prompt, a schema, or a cost number here, update the consumers.

---

## 0. Architecture at a glance

```
                  user prompt + buildType
                           |
                           v
         +-----------------------------------+
         |  1. DALL·E 3 — reference image    |  (1 or 4 calls)
         +-----------------------------------+
                           |
                           v  (image URL[s])
         +-----------------------------------+
         |  2. GPT-4o vision — voxelizer     |  structured output
         |     response_format: json_schema  |  -> VoxelGrid JSON
         +-----------------------------------+
                           |
                 valid?    |    invalid? -> client-side fallback
                           v
         +-----------------------------------+
         |  3. Validation + palette snap     |
         +-----------------------------------+
                           |
                           v
                /api/generate response
                  (image URL, voxel grid, generationId, costUsd)
                           |
                           v
                   editor opens with build
```

Three build types drive the prompt template and the post-processing rules:

| Build type   | Visual goal                          | Voxel constraint                                    |
| ------------ | ------------------------------------ | --------------------------------------------------- |
| `figure`     | Standalone 3D thing (a dragon)       | Full 3D occupancy, supported, optional multi-view   |
| `bas-relief` | Mosaic with depth (a portrait)       | Thin Z (≤ 4 voxels), all voxels touch back wall     |
| `diorama`    | Figure on a contextual base          | Figure on top, base layer at y=0 (≥ 2 voxels thick) |

---

## 1. DALL·E 3 prompt templates

All three templates share a **wrapper** that biases DALL·E toward voxel-friendly imagery (solid color blocks, low color count, plain background, clear silhouette). The user's free text becomes the **subject**; the wrapper enforces the visual language.

### 1.1 Shared wrapper rules (apply to every template)

- Solid flat color fills, no gradients, no textures
- 6–12 distinct colors total (Lego palette aesthetic)
- Pure white background, fully isolated subject
- Hard edges, cel-shaded, no soft lighting, no bloom
- No text, no labels, no watermark
- No realistic photography, no fine detail, no fur/hair strands

### 1.2 Template — `figure`

Front-facing 3/4 isometric view, no perspective foreshortening, clear silhouette readable from front.

```text
A 3D voxel-style {USER_PROMPT}, rendered as a standalone toy figure on a pure
white background. Isometric 3/4 front view, slightly above eye level, no
perspective distortion, orthographic feel. Solid flat colors only — between
6 and 12 distinct colors total, drawn from a primary Lego-like palette
(bright red, yellow, blue, green, white, black, light gray, dark gray, tan,
brown). Hard cel-shaded edges, no gradients, no textures, no soft lighting.
The subject must be fully isolated, centered, and occupy 70% of the frame
with clear empty margin around it. Strong, readable silhouette. No ground,
no shadow, no text, no watermark.
```

### 1.3 Template — `bas-relief`

Flat front-facing, high contrast, designed to map onto an XY plane with depth in Z.

```text
A flat front-facing portrait illustration of {USER_PROMPT}, designed as a
low-relief mosaic. Pure white background, perfectly head-on view, no
rotation, no perspective, no 3/4 angle. Solid flat colors only, high
contrast between foreground and background, between 6 and 10 distinct
colors total drawn from a Lego-like palette. Hard edges, posterized,
cel-shaded. Subject fills 80% of the frame, centered, fully isolated.
No gradients, no textures, no soft shadows, no text, no watermark.
```

### 1.4 Template — `diorama`

Figure on a clear ground plane so the voxelizer can identify the base.

```text
A 3D voxel-style {USER_PROMPT} standing on a small square ground base,
rendered as a tabletop diorama. Pure white background. Isometric 3/4 front
view, slightly above eye level, no perspective distortion. The ground base
is clearly visible as a flat, distinct-colored slab beneath the subject
(green for grass, gray for stone, blue for water, tan for sand — choose
the one that best fits the subject). The base must be visually separate
from the figure, occupying the bottom 15-25% of the frame. Solid flat
colors only, 6 to 12 distinct colors, hard cel-shaded edges, no gradients,
no soft lighting. Subject + base centered, fully isolated. No background
scenery, no text, no watermark.
```

### 1.5 OpenAI API call shape (DALL·E 3)

```ts
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const image = await openai.images.generate({
  model: "dall-e-3",
  prompt: renderTemplate(buildType, userPrompt),
  size: "1024x1024",   // square — the voxelizer expects square framing
  quality: "hd",        // $0.080 per image; "standard" is $0.040 if cost-tuning
  style: "vivid",       // hard, saturated colors — better for voxelization
  n: 1,
  response_format: "url",
});

const referenceImageUrl = image.data[0].url!;
```

Notes:
- `size: "1024x1024"` is mandatory — non-square sizes cost more and break our voxel framing assumptions.
- `quality: "hd"` is the default for production. The free tier MAY downgrade to `"standard"` (see §6).
- DALL·E 3 does not honor a `seed` parameter today. For multi-view consistency we rely on a textual style anchor (see §3), not seeding.
- `response_format: "url"` returns a temporary URL valid for ~60 minutes. The route persists the image to Vercel Blob (or S3) before responding.

---

## 2. GPT-4o voxelizer — structured output schema

GPT-4o receives the DALL·E reference image and a system prompt, and is **forced** via `response_format: { type: "json_schema", strict: true }` to return a `VoxelGrid` object.

### 2.1 TypeScript shape (the contract)

```ts
type VoxelGrid = {
  dimensions: { x: number; y: number; z: number };  // each axis bounded 8..32
  voxels: Array<{
    x: number;   // 0..dimensions.x-1
    y: number;   // 0..dimensions.y-1, y=0 is the ground / bottom
    z: number;   // 0..dimensions.z-1
    colorId: string;  // must match an id from /data/lego-palette.json
  }>;
  notes?: string;  // optional one-line model commentary, max 200 chars
};
```

### 2.2 Literal JSON schema (what we send to OpenAI)

```json
{
  "name": "voxel_grid",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "required": ["dimensions", "voxels", "notes"],
    "properties": {
      "dimensions": {
        "type": "object",
        "additionalProperties": false,
        "required": ["x", "y", "z"],
        "properties": {
          "x": { "type": "integer", "minimum": 8, "maximum": 32 },
          "y": { "type": "integer", "minimum": 8, "maximum": 32 },
          "z": { "type": "integer", "minimum": 8, "maximum": 32 }
        }
      },
      "voxels": {
        "type": "array",
        "minItems": 1,
        "maxItems": 4096,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "required": ["x", "y", "z", "colorId"],
          "properties": {
            "x": { "type": "integer", "minimum": 0, "maximum": 31 },
            "y": { "type": "integer", "minimum": 0, "maximum": 31 },
            "z": { "type": "integer", "minimum": 0, "maximum": 31 },
            "colorId": { "type": "string", "minLength": 1, "maxLength": 32 }
          }
        }
      },
      "notes": {
        "type": ["string", "null"],
        "maxLength": 200
      }
    }
  }
}
```

Notes on strictness:
- OpenAI's strict mode requires every property in `required` and `additionalProperties: false`. Optional fields must be modeled as `["string", "null"]`. That's why `notes` is required-but-nullable.
- `maxItems: 4096` is a hard ceiling so a runaway model doesn't blow our token budget. The realistic target is ~300–1500 voxels (≈100–300 buildable Lego pieces after auto-merge).
- `colorId` is a free string here because JSON schema enums get unwieldy with ~60+ Lego colors. We **validate it server-side** against `/data/lego-palette.json` after parsing (see §4).

### 2.3 System prompt (sent with the image)

```text
You are a voxelizer. Your job is to convert a reference image into a 3D voxel
grid that will be built out of physical Lego bricks.

You will be given:
- A reference image (DALL·E generated)
- A build type: "figure" | "bas-relief" | "diorama"
- A list of allowed colorIds from the official Lego palette

Hard rules:
1. Output MUST conform to the provided JSON schema. No prose, no markdown.
2. Every voxel.colorId MUST be one of the allowed colorIds from the palette
   provided. If you cannot match a color exactly, choose the closest one.
3. Grid axes:
   - x = left/right (subject's width)
   - y = up/down (y=0 is the ground; gravity points to -y)
   - z = front/back (z=0 is closest to the viewer)
4. Each axis dimension is between 8 and 32. Aim for 24 maximum on the
   longest axis. Smaller is better when detail is unclear.
5. Total voxel count target: 300–1500. Hard cap 4096.
6. Prioritize SILHOUETTE over interior detail. The reader of the build
   should recognize the subject from any angle. Do not add interior voxels
   that are not visible from outside unless they are needed for support.
7. Every voxel must rest on either y=0 OR another voxel directly below it
   (no floating voxels). For "figure" and "diorama", the build must be
   fully grounded.
8. Build-type-specific rules:
   - "figure": full 3D occupancy. The shape should read from front, side,
     and back. Do not flatten.
   - "bas-relief": dimensions.z must be <= 4. All voxels touch the back
     plane (z = dimensions.z - 1) directly or via a chain of voxels in -z.
     Treat the image as a height map.
   - "diorama": the bottom 1-3 layers (y=0, y=1, y=2) form a solid base
     plate that extends across the full x*z footprint. The figure sits on
     top of the base.
9. Use as few distinct colors as possible — 6 to 12 is ideal. Do not
   introduce gradients by alternating colors.

The "notes" field is optional. If you use it, write one short sentence
explaining any tradeoff you made (e.g., "Simplified wings to fit 24-voxel
budget"). Do not narrate. Do not apologize. Do not refuse.
```

### 2.4 OpenAI API call shape (GPT-4o)

```ts
const palette = await loadLegoPalette(); // from /data/lego-palette.json
const allowedColorIds = palette.map(p => p.id);

const completion = await openai.chat.completions.create({
  model: "gpt-4o",
  temperature: 0.2,
  max_tokens: 8000,
  messages: [
    { role: "system", content: VOXELIZER_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text:
            `Build type: ${buildType}\n` +
            `Allowed colorIds: ${allowedColorIds.join(", ")}\n` +
            `Voxelize the attached image.`
        },
        { type: "image_url", image_url: { url: referenceImageUrl, detail: "high" } },
        // For multi-view figure, include 2-4 image_url blocks here.
      ],
    },
  ],
  response_format: {
    type: "json_schema",
    json_schema: VOXEL_GRID_SCHEMA, // the literal object from §2.2
  },
});

const voxelGrid: VoxelGrid = JSON.parse(completion.choices[0].message.content!);
```

---

## 3. Multi-view strategy for `figure` mode

A single front-facing DALL·E image cannot describe what's on the back of a dragon. For `figure` mode we have two options to recover the missing 270°.

### 3.1 Option A — 4 DALL·E views, one GPT-4o unified call (RECOMMENDED)

1. Generate 4 DALL·E images sequentially: front, right side, back, top-down.
2. Each call uses the same base prompt with a view-specific suffix and a **style anchor** sentence repeated verbatim across all four calls (DALL·E 3 does not expose seeds, so style consistency is achieved through prompt repetition).
3. Send all 4 image URLs to one GPT-4o vision call along with a system prompt that tells it which image is which view.
4. GPT-4o returns one unified `VoxelGrid`.

**Style anchor (literal, repeated in all four prompts):**

```text
Maintain a consistent style across all views: same character design, same
exact color palette, same proportions, same level of detail, same flat
cel-shaded aesthetic on a pure white background.
```

**View suffixes:**

- front: `Front view, head-on, the subject facing directly at the camera.`
- side: `Right-side profile, perfectly horizontal, the subject facing left.`
- back: `Rear view, the back of the subject facing the camera.`
- top: `Top-down view, looking straight down at the subject from directly above.`

### 3.2 Option B — voxelize each view client-side then intersect silhouettes

Run the existing `brick-lab.html` voxelizer on each of the 4 images, project each into 3D as a silhouette extrusion, then take the **intersection** (a voxel exists only if it appears solid in all 4 silhouettes). Skip GPT-4o entirely for the figure step.

### 3.3 Recommendation: **Option A**

Reasoning:
- **Quality.** GPT-4o can reason about the subject as a whole — it knows that the wing visible in the side view is the same wing barely peeking from behind in the front view. Silhouette intersection (Option B) is correct only for convex shapes; it eats concavities (e.g., an open mouth, the gap between legs) and produces hollow figures with phantom voxels in the negative space between limbs.
- **Color fidelity.** Option B gives us per-view colors we have to reconcile heuristically. Option A gives us a single palette decision, made by a model that can see all four views at once.
- **Cost.** Option A is more expensive but still <$0.40 (see §6). Acceptable.
- **Failure mode.** Option B's failures are silent (a wrong shape). Option A's failures are loud (schema validation fails) and trigger the deterministic fallback (§4).

We keep Option B as the **fallback**, not the primary path.

### 3.4 Cost — `figure` multi-view (Option A)

| Step                  | Calls | Unit                | Subtotal     |
| --------------------- | ----- | ------------------- | ------------ |
| DALL·E 3 HD 1024²     | 4     | $0.080              | $0.320       |
| GPT-4o vision (4 imgs) | 1    | ~$0.025 (4 imgs hi) | $0.025       |
| **Total**             |       |                     | **~$0.345**  |

For comparison, single-view `figure` is ~$0.10. Multi-view is the premium path.

---

## 4. Fallback path

If GPT-4o's response fails any validation, we fall back to the deterministic client-side voxelizer (`brick-lab.html` logic, single-image silhouette + height-map extrusion). The user is **never** shown a hard error unless DALL·E itself fails.

### 4.1 Validation triggers (any one fires the fallback)

1. **JSON parse error** — the model output isn't valid JSON (rare with strict mode but possible on truncation).
2. **Schema mismatch** — strict mode rejected the response (OpenAI returns an error).
3. **Invalid `colorId`** — any voxel uses a `colorId` not in `/data/lego-palette.json`. (We try a one-pass nearest-neighbor snap to the palette in Lab color space first; if >5% of voxels needed snapping, treat as a soft failure → fallback.)
4. **Voxel count too high** — `voxels.length > 4096` or > the per-buildType ceiling (figure: 1500, bas-relief: 1024, diorama: 2000).
5. **Floating voxels** — any voxel at y > 0 with no voxel directly at (x, y-1, z). Threshold: if >2% of voxels are floating after a single gravity-collapse pass, fallback.
6. **Empty grid** — `voxels.length < 20`. The model gave up.
7. **Build-type rule violation** —
   - `bas-relief` with `dimensions.z > 4`
   - `diorama` with no contiguous base layer at y=0
   - `figure` collapsed flat (any axis < 4)
8. **Timeout** — GPT-4o call exceeds 30s.

### 4.2 Fallback voxelizer (deterministic)

- For `bas-relief`: lift the existing `brick-lab.html` height-map extrusion code. Quantize the reference image to the palette, project to a Z-depth map. Already proven.
- For `figure`: silhouette intersection (Option B from §3.2) if multi-view, otherwise single-image extrusion with mirrored Z (cheap symmetry assumption).
- For `diorama`: figure fallback for the top, plus a hard-coded base slab at y=0 (color from a small heuristic: average of bottom 20% of the image).

### 4.3 Communicating fallback to the user

The `/api/generate` response includes a `generationMode` field that the editor surfaces as a small, non-alarming pill in the top toolbar:

- `generationMode: "ai-voxelized"` → no pill, this is the happy path.
- `generationMode: "ai-fallback"` → pill: **"AI was a little shy on this one — we sketched it for you. Edit freely."** (Subdued tone, gray background, no error icon.)
- `generationMode: "ai-fallback-multi-view-degraded"` → pill: **"Used 1 view instead of 4. Edit freely."** (Triggered if some, not all, of the 4 DALL·E calls succeeded.)

Telemetry: every fallback logs `{ generationId, trigger, buildType, multiView }` to our metrics store so we can tune prompts.

---

## 5. Server route shape — `/app/api/generate/route.ts`

### 5.1 Input

```ts
type GenerateRequest = {
  prompt: string;                       // user free text, 3..500 chars
  buildType: "figure" | "bas-relief" | "diorama";
  multiView?: boolean;                  // default false; only honored if buildType === "figure"
  // future: stylePreset, colorBudget, sizeBudget — out of scope for v1
};
```

### 5.2 Output

```ts
type GenerateResponse = {
  generationId: string;                 // uuid; primary key for the build record
  referenceImageUrls: string[];         // 1 url for single-view, up to 4 for multi-view (front/side/back/top in order)
  voxelGrid: VoxelGrid;                 // see §2.1
  buildType: "figure" | "bas-relief" | "diorama";
  generationMode:
    | "ai-voxelized"
    | "ai-fallback"
    | "ai-fallback-multi-view-degraded";
  costUsd: number;                      // total spend on this generation, 4 decimal places
  durationMs: number;                   // wall-clock
  paletteVersion: string;               // hash of /data/lego-palette.json used
  createdAt: string;                    // ISO 8601
};
```

### 5.3 Error states

```ts
type GenerateError = {
  generationId: string;                 // we always issue one, even on failure, for support
  code:
    | "INVALID_INPUT"           // 400 — prompt too short/long, bad buildType
    | "MODERATION_BLOCKED"      // 400 — DALL·E refused (e.g. trademarked content)
    | "DALLE_FAILED"            // 502 — image generation failed and no retry left
    | "RATE_LIMITED"            // 429 — user hit free-tier ceiling (see §6)
    | "OPENAI_DOWN"             // 503 — upstream outage
    | "INTERNAL";               // 500 — anything else
  message: string;              // safe to display to the user
  retryable: boolean;
  costUsd: number;              // partial spend if any (never charged to user, just logged)
};
```

Note: GPT-4o failures alone do NOT bubble up as errors — they trigger the fallback (§4), and the response is `200 OK` with `generationMode: "ai-fallback"`.

### 5.4 Route skeleton

```ts
// app/api/generate/route.ts
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds; multi-view can take ~40s

export async function POST(req: NextRequest): Promise<NextResponse<GenerateResponse | GenerateError>> {
  const body = (await req.json()) as GenerateRequest;
  // 1. Validate body
  // 2. Check rate limit (per IP for anon, per userId for signed-in)
  // 3. Generate DALL·E image(s)
  // 4. Persist images to Blob
  // 5. Call GPT-4o voxelizer
  // 6. Validate VoxelGrid; on failure run fallback voxelizer
  // 7. Snap colorIds to palette
  // 8. Persist generation record
  // 9. Return GenerateResponse
}
```

---

## 6. Cost & rate-limit table

### 6.1 Per-generation cost (production, `quality: "hd"`)

| Build type             | DALL·E calls | DALL·E $ | GPT-4o $ | **Total**     |
| ---------------------- | ------------ | -------- | -------- | ------------- |
| `figure` single-view   | 1            | $0.080   | ~$0.015  | **~$0.095**   |
| `figure` multi-view    | 4            | $0.320   | ~$0.025  | **~$0.345**   |
| `bas-relief`           | 1            | $0.080   | ~$0.012  | **~$0.092**   |
| `diorama`              | 1            | $0.080   | ~$0.018  | **~$0.098**   |

GPT-4o vision is priced on input tokens (~$5 per 1M) and image tiles (~$0.001275 per 512px tile at high detail). A 1024² image at `detail: "high"` is roughly 4 tiles + ~150 prompt-management tokens ≈ $0.005–$0.008 per image. Output (the voxel JSON) at ~1500 voxels ≈ ~6k output tokens × $15/1M = ~$0.009. Numbers above are rounded up to leave headroom.

### 6.2 Free-tier limits (suggested, anon + signed-in)

| User class                  | `figure` SV | `figure` MV | `bas-relief` | `diorama` | Daily $ ceiling |
| --------------------------- | ----------- | ----------- | ------------ | --------- | --------------- |
| Anonymous (per IP, per day) | 3           | 0           | 3            | 1         | $0.40           |
| Signed-in free              | 10          | 1           | 10           | 5         | $1.50           |
| Signed-in pro (future)      | unlimited\* | 20/day      | unlimited\*  | unlimited\* | $20.00          |

\* "Unlimited" = governed by daily $ ceiling, not per-buildType count.

### 6.3 Rate-limit implementation notes

- Use Upstash Redis or Vercel KV with a sliding-window counter keyed by `ip:${ip}` (anon) or `user:${userId}` (signed-in).
- Always increment a `costUsd` ledger per key per UTC day. The ceiling check is `current + estimatedCost <= ceiling`.
- Estimated cost for the pre-flight check uses the table in §6.1 (worst-case per build type).
- If estimated cost would exceed the ceiling, return `429 RATE_LIMITED` **before** spending any OpenAI money.
- Multi-view defaults to OFF in the UI for free-tier anon. Signed-in free can opt in but it costs them 4× of their daily figure budget.

### 6.4 Cost-tuning levers (not deployed in v1, but listed for future use)

1. Drop DALL·E to `quality: "standard"` ($0.040 → halves DALL·E cost). Visible quality drop on figures, acceptable on bas-relief.
2. Drop GPT-4o vision to `detail: "low"` (~85 tokens flat). ~3× cheaper but voxel fidelity tanks below 16³.
3. Cache identical (prompt, buildType) tuples for 24h. Memoize at the route layer.
4. For multi-view, send GPT-4o only 2 views (front+side) instead of 4. ~50% cheaper with mostly-acceptable rear inference.

---

## 7. Open questions (track in issues, do not block v1)

- Should we retry GPT-4o once on schema-validation failure before falling back? (Probably yes, with `temperature: 0`.)
- Lego palette versioning — when we add new colors, in-flight builds must keep referencing the version they were generated against (`paletteVersion` field is in place for this).
- Moderation: DALL·E rejects trademarked characters. We need a polite error UX for "I asked for Yoda."
- Image persistence TTL: do we keep DALL·E URLs forever (gallery) or only for the editor session? Affects Blob storage cost.
