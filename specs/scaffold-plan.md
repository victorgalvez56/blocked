# Blocked — Next.js 16 Scaffold Plan

Working name: `blocked` (final brand TBD per brief). Phase 1 target: text → 3D figure landing in editor.

---

## 1. File Tree

```
blocked/
├── PROJECT_BRIEF.md
├── README.md
├── .env.example                                  # OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
├── .env.local
├── .gitignore
├── .nvmrc                                        # node 22
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json
├── eslint.config.mjs
├── package.json
├── pnpm-lock.yaml
├── middleware.ts                                 # supabase auth refresh + locale rewrite
├── public/
│   ├── favicon.ico
│   ├── og-image.png
│   ├── brand/logo.svg
│   └── studs.glb
├── data/
│   ├── lego-palette.json                         # built — colors w/ BrickLink IDs
│   ├── lego-bricks.json                          # built — brick sizes + part IDs
│   └── prompts/
│       ├── figure-system.txt
│       ├── basrelief-system.txt
│       └── diorama-system.txt
├── messages/
│   ├── en.json
│   └── es.json
├── i18n.ts
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── not-found.tsx
│   │   ├── error.tsx
│   │   ├── [locale]/
│   │   │   ├── layout.tsx
│   │   │   ├── (home)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx                      # landing
│   │   │   │   ├── pricing/page.tsx              # deferred
│   │   │   │   └── changelog/page.tsx            # deferred
│   │   │   ├── (editor)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── new/page.tsx                  # generation entry
│   │   │   │   └── project/[id]/page.tsx         # 3D editor canvas
│   │   │   ├── (auth)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── login/page.tsx                # deferred (Phase 4)
│   │   │   │   ├── signup/page.tsx               # deferred
│   │   │   │   └── callback/route.ts
│   │   │   ├── (legal)/
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── terms/page.tsx
│   │   │   │   └── privacy/page.tsx
│   │   │   └── gallery/
│   │   │       ├── page.tsx                      # deferred (Phase 4)
│   │   │       └── [id]/page.tsx                 # deferred
│   │   └── api/
│   │       ├── generate/route.ts                 # POST: text → image + structured 3D plan
│   │       ├── generate/status/[jobId]/route.ts  # deferred
│   │       ├── projects/route.ts                 # deferred (Phase 4)
│   │       ├── projects/[id]/route.ts            # deferred
│   │       └── health/route.ts
│   ├── components/
│   │   ├── ui/                                   # shadcn primitives
│   │   ├── home/{hero, prompt-launcher, how-it-works, footer}.tsx
│   │   ├── generate/{build-type-picker, prompt-form, generation-progress, reference-preview}.tsx
│   │   ├── editor/
│   │   │   ├── editor-shell.tsx                  # 3-pane layout
│   │   │   ├── canvas/{voxel-canvas, voxel-mesh, baseplate, reference-overlay, ghost-brick, camera-rig, grid-helper}.tsx
│   │   │   ├── toolbar/{tool-palette, color-picker, brick-size-picker, undo-redo-buttons, camera-presets}.tsx
│   │   │   ├── inspector/{stats-panel, bom-panel, layer-panel}.tsx
│   │   │   ├── overlays/{keyboard-shortcuts, empty-state}.tsx
│   │   │   └── status-bar.tsx
│   │   └── shared/{locale-switcher, theme-toggle, logo, loading-spinner}.tsx
│   ├── hooks/
│   │   ├── useGenerationJob.ts
│   │   ├── useVoxelEditor.ts                     # primary editor state machine
│   │   ├── useUndoRedo.ts
│   │   ├── useBuildProject.ts                    # IndexedDB-backed
│   │   ├── useBomExport.ts                       # deferred (Phase 3)
│   │   ├── useKeyboardShortcuts.ts
│   │   ├── useReferenceImage.ts
│   │   ├── useToolState.ts
│   │   ├── useRaycastTarget.ts
│   │   ├── useAutosave.ts
│   │   └── useSupabaseUser.ts                    # deferred (Phase 4)
│   ├── lib/
│   │   ├── voxel-grid.ts                         # core data structure
│   │   ├── voxelizer.ts                          # client-side fallback
│   │   ├── palette.ts
│   │   ├── bricks.ts
│   │   ├── bom.ts                                # deferred (Phase 3)
│   │   ├── exporters/{bricklink-xml, pickabrick-csv}.ts  # deferred
│   │   ├── openai/{client, dalle, gpt-vision, prompts}.ts
│   │   ├── idb/{db, projects-cache, generations-cache}.ts
│   │   ├── supabase/{client, server, middleware}.ts  # stubs in Phase 1
│   │   ├── three/{brick-geometry, stud-geometry, materials, instanced-helpers}.ts
│   │   ├── commands/{command, place-brick, remove-brick, paint-brick, bulk-replace}.ts
│   │   ├── color/{nearest-lego, lab}.ts
│   │   ├── utils/{cn, nanoid, env, rate-limit}.ts
│   │   └── validators/{generate-request, voxel-plan}.ts
│   ├── types/
│   │   ├── voxel.types.ts
│   │   ├── brick.types.ts
│   │   ├── palette.types.ts
│   │   ├── generation-job.types.ts
│   │   ├── build-project.types.ts
│   │   ├── bom.types.ts
│   │   ├── tool.types.ts
│   │   ├── command.types.ts
│   │   └── api.types.ts
│   └── styles/editor.css
└── tests/
    ├── lib/voxel-grid.test.ts
    ├── lib/voxelizer.test.ts
    ├── lib/color/nearest-lego.test.ts
    └── lib/validators/voxel-plan.test.ts
```

---

## 2. Type Files (key shapes)

### `src/types/voxel.types.ts`
```ts
export type VoxelCoord = readonly [x: number, y: number, z: number];
export type VoxelKey = `${number},${number},${number}`;
export interface Voxel {
  coord: VoxelCoord;
  colorId: number;
  brickId: string;          // "1x1" in Phase 1
  rotation: 0 | 90 | 180 | 270;
}
export interface VoxelGridSnapshot {
  size: { x: number; y: number; z: number };
  voxels: Voxel[];
  baseplate: { width: number; depth: number };
}
```

### `src/types/brick.types.ts`
```ts
export interface BrickDef {
  id: string;                // "1x1", "1x2", "2x2", "2x4"
  studsX: number; studsZ: number;
  heightPlates: 3;
  bricklinkPartId: string;
  pickabrickElementId?: string;
  weightGrams?: number;
}
export type BrickId = BrickDef['id'];
```

### `src/types/palette.types.ts`
```ts
export interface LegoColor {
  id: number;
  name: string;
  hex: `#${string}`;
  rgb: [number, number, number];
  bricklinkColorId: number;
  pickabrickColorId?: number;
  category: 'solid' | 'transparent' | 'metallic' | 'pearl';
  available: boolean;
}
export type LegoPalette = LegoColor[];
```

### `src/types/generation-job.types.ts`
```ts
export type BuildType = 'figure' | 'basrelief' | 'diorama';
export type GenerationStatus =
  | 'idle' | 'generating-image' | 'analyzing-image'
  | 'voxelizing' | 'done' | 'error';
export interface GenerationRequest {
  prompt: string;
  buildType: BuildType;
  maxBricks?: number;
  seed?: number;
}
export interface GenerationResult {
  jobId: string;
  imageUrl: string;
  voxelPlan: VoxelGridSnapshot;
  promptUsed: string;
  buildType: BuildType;
  createdAt: number;
}
```

### `src/types/build-project.types.ts`
```ts
export interface BuildProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  buildType: BuildType;
  reference: { imageUrl: string; prompt: string };
  grid: VoxelGridSnapshot;
  palette: LegoPalette;
  schemaVersion: 1;
}
```

### `src/types/command.types.ts`
```ts
export interface Command {
  do(grid: VoxelGrid): void;
  undo(grid: VoxelGrid): void;
  label: string;
}
```

---

## 3. Routes (under `/app/[locale]/`)

| Path | Group | Phase | Renders |
|---|---|---|---|
| `/` | `(home)` | 1 | Landing: hero, `<PromptLauncher>`, how-it-works, footer |
| `/new` | `(editor)` | 1 | `<PromptForm>` + `<BuildTypePicker>` + `<GenerationProgress>` |
| `/project/[id]` | `(editor)` | 1 | Full `<EditorShell>` with R3F canvas |
| `/login` | `(auth)` | 4 | Supabase login |
| `/signup` | `(auth)` | 4 | Supabase signup |
| `/callback` | `(auth)` | 4 | OAuth callback |
| `/terms` | `(legal)` | 1 stub | Markdown body |
| `/privacy` | `(legal)` | 1 stub | Markdown body |
| `/gallery` | top-level | 4 | Public gallery |
| `/gallery/[id]` | top-level | 4 | Read-only viewer |

---

## 4. Hooks

| Hook | Job | Phase |
|---|---|---|
| `useGenerationJob(req)` | POST `/api/generate`, track state | 1 |
| `useVoxelEditor(projectId)` | Primary editor state machine | 1 |
| `useUndoRedo<TCommand>()` | Generic command stack, capped at 200 | 1 |
| `useBuildProject(id)` | Load/save from IndexedDB | 1 |
| `useReferenceImage(project)` | Always-visible reference overlay | 1 |
| `useToolState()` | Zustand: tool/color/brick | 1 |
| `useRaycastTarget(canvasRef)` | Pointer → grid coord | 1 |
| `useKeyboardShortcuts(handlers)` | Editor hotkeys | 1 |
| `useAutosave(project, delayMs)` | Debounced IDB write | 1 |
| `useBomExport(project)` | BrickLink XML / PaB CSV | 3 |
| `useSupabaseUser()` | Session via Supabase client | 4 |
| `useGalleryFeed(filter)` | Paginated public builds | 4 |

---

## 5. API Routes

### `POST /app/api/generate/route.ts` (Phase 1)

**Runtime:** `nodejs`. **Auth:** none (rate-limit by IP).

**Request body** (zod-validated):
```ts
{
  prompt: string,            // 3..500
  buildType: 'figure' | 'basrelief' | 'diorama',
  maxBricks?: number,        // default 250, clamp 50..500
  seed?: number
}
```

**Pipeline:**
1. `generateReferenceImage(prompt, buildType)` — DALL·E 3, 1024×1024, style preset per build type.
2. `imageToVoxelPlan(imageUrl, buildType, maxBricks, palette)` — GPT-4o vision + structured outputs (zod schema). Returns `VoxelGridSnapshot` constrained to palette indices.
3. Validate against `voxel-plan.ts` zod schema; on mismatch retry once.
4. Build `GenerationResult` with `jobId = nanoid()`.

**Response:**
```ts
{ ok: true, result: GenerationResult }
| { ok: false, error: string, code: 'rate_limited'|'bad_input'|'openai_failed'|'unknown' }
```

Phase 1 is synchronous (~15–30s). Status polling endpoint deferred.

### `GET /app/api/health/route.ts`
Liveness probe.

---

## 6. Phase 1 Cut

**Build now:**
- All 9 type files
- `(home)/page.tsx`, `(editor)/{new, project/[id]}/page.tsx`, `(legal)/{terms, privacy}/page.tsx`
- shadcn primitives: button, input, textarea, dialog, tabs, slider, select, tooltip, sonner, popover, card, skeleton
- `components/home/*`, `components/generate/*`
- `editor-shell` + `canvas/*` + `toolbar/{tool-palette, color-picker, undo-redo-buttons, camera-presets}` + `inspector/stats-panel` + `overlays/*` + `status-bar`
- 9 hooks listed under Phase 1
- All `lib/*` except `bom.ts`, `exporters/*`
- `app/api/{generate, health}/route.ts`
- 4 test files
- Supabase triplet stubs (compile, unused)

**Deferred:**
- **Phase 2:** brick-size-picker, layer-panel, multi-size logic, symmetry, multi-select, copy/paste
- **Phase 3:** bom-panel, `lib/bom.ts`, exporters, `useBomExport`
- **Phase 4:** all auth/gallery/api projects, `useSupabaseUser`, `useGalleryFeed`
- pricing, changelog, status polling, multi-locale messages beyond `en`

---

## 7. Bootstrap Commands

Run from `/Users/victorgalvez/Documents/me/blocked`.

```bash
pnpm dlx create-next-app@latest . \
  --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --use-pnpm --no-turbopack

echo "22" > .nvmrc
pnpm add react@^19 react-dom@^19
pnpm add -D @types/react@^19 @types/react-dom@^19

pnpm add three @react-three/fiber @react-three/drei
pnpm add -D @types/three

pnpm add zustand zod nanoid clsx tailwind-merge class-variance-authority idb-keyval
pnpm add openai
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add next-intl
pnpm add lucide-react

pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button input textarea dialog tabs slider select \
  tooltip sonner popover card skeleton

pnpm add -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
pnpm add -D prettier prettier-plugin-tailwindcss
```

---

## 8. Implementation Sequence

1. **Types first** — all 9 files lock contracts.
2. **Datasets imported** — `data/lego-{palette,bricks}.json` already built.
3. **Voxel grid** — `lib/voxel-grid.ts` (Map-backed, O(1)). Test first.
4. **Color matching** — `lib/color/{lab, nearest-lego}.ts`.
5. **Three.js helpers** — `lib/three/*`. One `InstancedMesh` per (brickId × colorId) pair.
6. **R3F canvas in isolation** — render hardcoded snapshot, verify 500-brick perf.
7. **Editor state** — `useToolState`, `useUndoRedo`, `useVoxelEditor`. Wire commands. Raycast place/remove/paint.
8. **IDB layer** — `lib/idb/*`, `useBuildProject`, `useAutosave`. Manual create + reload.
9. **OpenAI server route** — `lib/openai/*` + `app/api/generate/route.ts`. Prompts in `data/prompts/*.txt`. Hard-code zod schema.
10. **Generation UI** — `(editor)/new/page.tsx` posts, shows progress, on success writes IDB and routes to `/project/[id]`.
11. **Editor shell** — `editor-shell.tsx` lays out toolbar/canvas/inspector. Reference overlay always visible.
12. **Landing page** — `(home)/page.tsx` deep-links to `/new?prompt=...&type=...`.
13. **Polish** — sub-200ms feedback, error toasts, keyboard sheet, autosave indicator, terms/privacy stubs.
14. **Smoke test** — type → image → 3D figure → place/remove/paint → undo → reload → state persists.

---

## 9. Architectural Decisions

- **Voxel grid is a class** with internal `Map<VoxelKey, Voxel>` for O(1) ops; serialize via `toSnapshot()` only at IDB/network boundaries.
- **One `InstancedMesh` per (brickId × colorId) pair.** ~50 meshes max for Phase 1.
- **Commands, not setState diffs.** Every mutation goes through a `Command`; undo is automatic. AI plan loads as a single `BulkReplaceCommand`.
- **Phase 1 keeps GPT-4o on a leash via zod.** One retry on schema mismatch, then fall back to client `lib/voxelizer.ts` running on the DALL·E image.
- **Supabase stubs in Phase 1.** Phase 4 wiring is config-only.
- **Reference image is a first-class citizen.** Stored on `BuildProject.reference`, rendered as fixed-position floating panel, never lost as the camera moves.

---

## Critical Files

- `src/lib/voxel-grid.ts`
- `src/types/voxel.types.ts`
- `src/app/api/generate/route.ts`
- `src/hooks/useVoxelEditor.ts`
- `src/components/editor/canvas/voxel-canvas.tsx`
