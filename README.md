<div align="center">

# Blocked

> *Drop an image. Get a buildable brick figure.*

A 3D brick design studio that voxelizes any image into a real, orderable brick build. Drop a PNG, tune the geometry sliders, and get back a 3D figure snapped to the official Lego color palette — with a full Bill of Materials ready to paste into BrickLink. Built with Next.js 16, React Three Fiber, and OpenAI.

![Blocked preview](docs/preview.gif)

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev)
[![Three.js](https://img.shields.io/badge/Three.js-r168-049EF4)](https://threejs.org)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933)](package.json)

</div>

---

## Overview

Blocked turns any image into a 3D voxelized brick figure you can actually build with real Lego-compatible pieces. A front-driven voxelizer reconstructs shape and depth from silhouettes; the studio editor lets you tune resolution, density, and background cut in real time. When you're done, export a BrickLink XML parts list — 34 official colors, exact piece counts by size.

The AI pipeline (gpt-image-1 + Trellis) is there for going from text to a 3D figure without a source image, but the core voxelizer is instant and runs entirely client-side.

## Tech stack

| Layer | Tech |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4 |
| 3D / rendering | Three.js, React Three Fiber, Drei |
| Animation | GSAP 3 |
| AI generation | OpenAI DALL-E / gpt-image-1, Replicate (Trellis) |
| Backend / auth | Supabase |
| Video pipeline | Remotion |
| Testing | Vitest, Testing Library |

## Quick start

**Requirements**: Node ≥ 20, pnpm

```bash
git clone https://github.com/victorgalvez56/blocked.git
cd blocked
pnpm install
cp .env.example .env.local   # add OPENAI_API_KEY, SUPABASE_* keys
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and drop an image on the studio.

## Architecture

```
┌──────────────────────────────┐    ┌──────────────────────────────┐
│  Studio  (React Three Fiber) │    │  AI pipeline  (Next.js API)  │
│  — source image panel        │    │  /api/dalle-image            │
│  — geometry sliders          │ ←→ │  /api/dalle-views  (4-view)  │
│  — live 3D voxel preview     │    │  /api/dalle-views-8          │
│  — BOM panel + export        │    │  /api/lab/generate-3d        │
└──────────────────────────────┘    └──────────────────────────────┘
                    ↓
     voxelizer  (client-side, Three.js orthographic cameras)
┌──────────────────────────────┐
│  front silhouette → depth    │
│  side / top as thickness cap │
│  palette snap + brick merge  │
└──────────────────────────────┘
```

## Project structure

```
.
├── src/
│   ├── app/
│   │   ├── studio/         # main design studio
│   │   ├── lab/            # AI 3D experiments
│   │   └── api/            # AI generation endpoints
│   ├── lib/
│   │   ├── voxelizer/      # image → 3D voxel grid
│   │   ├── exporters/      # BrickLink XML export
│   │   ├── color/          # official Lego palette (34 colors)
│   │   └── openai/         # AI prompt helpers
│   └── types/              # shared TypeScript types
├── remotion/               # video reel pipeline
├── specs/                  # AI pipeline & scaffold docs
├── data/                   # brick palette data
└── docs/
    └── preview.gif
```

## Features

### Voxelizer

The front view drives the silhouette and shape. Side and top views act as per-row/column thickness caps — no cross-shaped extrusion artifacts. Bricks are centered around `midZ` for symmetric depth. Resolution goes up to 48 studs per axis; density and background-cut are tunable sliders.

**Brick optimization** merges adjacent same-color 1×1s into larger pieces (1×2, 1×4, 1×6, 1×8, 2×3, 2×4). **Hollow interior** skips pieces that will never be visible, cutting piece count significantly.

### AI generation modes

| Mode | Cost | Time | How |
| --- | --- | --- | --- |
| 4-view (`gpt-image-1`) | ~$0.17 | ~30–60 s | front view generated first as anchor; side/back/top edited with front as reference for identity consistency |
| 8-view (`gpt-image-1`) | ~$0.34 | ~30–60 s | 8 views at 45° intervals; front as reference for all 7 edits |
| Max detail (Trellis) | ~$0.08 | ~30–60 s | text → DALL-E → Trellis AI mesh → 4 ortho renders → voxelizer |

AI buttons are gated behind `SHOW_AI_GENERATE` — the code paths and API routes are preserved but hidden for the default build.

### Studio controls

| Action | How |
| --- | --- |
| Orbit | Left-drag |
| Zoom | Scroll |
| Pan | Right-drag |
| Build mode | Layer-by-layer slice view |
| Explode | Separates bricks for interior inspection |
| Export | BrickLink XML — paste into Wanted List |

### Remotion video pipeline

```bash
pnpm remotion:studio        # preview the reel
pnpm remotion:render        # renders out/blocked-reel.mp4
```

## Contributing

PRs welcome. The codebase is small enough to read top-to-bottom in an afternoon.

1. **Fork → clone → branch** (`git checkout -b feat/your-thing`)
2. Run locally with `pnpm dev`
3. Keep changes scoped — one feature/fix per PR
4. Match existing style: TypeScript strict, Tailwind for all styling, no inline styles
5. No formatting-only commits mixed with logic changes
6. Open a PR with a short description of *why* the change matters, not *what*

### Good first issues

- Multi-size brick support (1×2, 2×2, 2×4) with collision detection in the editor
- Auto-optimization mode: merge adjacent same-color 1×1s into larger pieces
- Symmetry / mirror mode across X or Z axis in the studio
- Multi-select, group move, and copy/paste in the studio
- Layer visibility toggle for working on interior sections
- Step-by-step build instructions exported as a layer-by-layer PDF
- Estimated cost preview based on BrickLink marketplace prices
- Public gallery: save builds to Supabase, share via URL

### Conventions

- **Commits**: imperative present tense, no trailing period (`add multiview pipeline`, not `Added multiview pipeline.`)
- **Types**: all shared types live in `src/types/`, co-located types in the same file as their consumer
- **Magic numbers**: lift to module-level constants
