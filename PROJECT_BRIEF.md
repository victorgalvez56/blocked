# Product Brief — [Name TBD]

## The Pitch

**From idea to a buildable 3D Lego figure in seconds — no photo, no scan, no prior model required.**

## Why This Exists

Adult Lego builders spend hours conceptualizing creations before committing to physical pieces. Existing tools force a frustrating choice: 2D mosaic generators that produce flat wall art, or 3D scanning apps that require you to already have the object in physical form. There's no fluid path from imagination to a buildable 3D figure.

This product closes that gap. The user describes what they want — a dragon, their dog, a logo, a piece of architecture — and gets back a 3D voxelized Lego figure they can refine and ultimately build with real bricks.

## Who It's For

The serious adult Lego builder who prototypes ideas before purchasing pieces. They care about:
- Pieces that actually exist in the official Lego palette
- A buildable result, not just a pretty render
- Creative control to refine what AI generated
- Knowing exactly what to buy and how much it will cost

**Not the target:** kids, casual users who want a one-click toy, or pure digital voxel artists with no intent to build physically.

## The Wedge

The 2D mosaic space is saturated. Brick Me, Brickapic, BrickPix, Lego Art Remix, Brickmosaicdesigner, BrickifyMe and others all converge on the same product: photo → flat mosaic → parts list. The 3D space has fewer players, and the existing ones all start from physical reality (Brick My World needs photogrammetry of a real object; Brickwork.app produces relief mosaics).

Nobody owns the path from **"describe it"** to **"buildable 3D figure."** That's the opening.

## Core Experience

**1. Conjure.** The user types a prompt or uploads an image and chooses the build type — standalone 3D figure (a dragon), bas-relief mosaic (a portrait), or diorama (figure with contextual base). AI generation produces the visual reference within seconds.

**2. Voxelize.** The reference becomes a 3D Lego construction — bricks placed on a baseplate, in the official Lego color palette, scaled to a small tabletop build (~100–300 pieces target).

**3. Refine.** The user enters a 3D editor with the reference image always visible. They add, remove, paint, and rearrange bricks until satisfied. They can switch between brick sizing modes (1x1 only, mixed sizes, or auto-optimization that combines small bricks into larger pieces).

**4. Build.** The user receives a complete BOM — exact piece counts by color and size — formatted to be copy-pasted into BrickLink or Pick-a-Brick. They go from screen to physical build with one click of context.

**5. Share.** Optionally, the user saves the build to their account and posts to a public gallery where others can view, fork, and remix.

## Priority Order

In strict order. Don't skip ahead.

1. **AI generation that feels magical.** The wow is the moment a vague description becomes a tangible 3D thing. Fast, beautiful, consistently good.
2. **A manual editor that respects the user.** After AI does its thing, the user owns the build. Fluid, satisfying, undoable, powerful.
3. **A trustworthy BOM.** Every piece in the build must map to a real, orderable Lego part. The numbers must add up. This is the contract that makes the build genuinely buildable.
4. **Community via gallery.** Once the core works, users can share and discover.

## Non-Negotiables

- **Buildable for real.** Every brick must exist as an orderable Lego piece. No invented sizes, no impossible colors.
- **Real product feel, not demo.** Polished, deployed, fast, branded. The juror should walk away thinking "this exists."
- **The user is the constructor, not a spectator.** AI is a starting point. Creative agency stays with the user.
- **The reference is always visible.** From any camera angle, the user can consult what they're building toward.
- **Zero friction to experiment.** Generous undo, clear previews, keyboard shortcuts, instant feedback.

## Brand Direction

A short, playful, Lego-evocative name. Working candidates:
- **Snap** — sonic, evokes the satisfying click of bricks connecting
- **BrickLab** — direct, suggests experimentation
- **Studs** — Lego jargon, ownable, slightly cheeky
- **Click** — onomatopoeic, minimal
- **Brickly** — friendly, approachable

Visual identity should feel like a tool for serious play — not childish, not cold-corporate. The brand of a designer's tool that happens to make Lego.

## What Already Exists

Two standalone prototypes that prove out half the experience:

- `brick-lab.html` — image-to-3D voxelizer with multiple depth modes, official Lego palette, rotatable 3D view. **Validates:** image → 3D transformation works.
- `brick-builder.html` — 3D editor where the user places, removes, and paints bricks on a baseplate, with a reference image always visible. **Validates:** the editing experience.

Neither has AI generation, accounts, gallery, multi-size pieces, BOM export, or true 360° standalone figures. These are the gaps to close.

## Roadmap by Priority

### Phase 1 — The Magic Moment
- Text-to-image generation flow with build-type selector (figure / bas-relief / diorama)
- Image-to-3D conversion that produces a genuine 3D figure (not just bas-relief) when "figure" mode is chosen
- Result lands directly in the manual editor

### Phase 2 — The Editor Made Real
- Multi-size brick support (1x1, 1x2, 2x2, 2x4) with collision detection
- Auto-optimization mode (combine adjacent same-color 1x1s into larger pieces)
- Symmetry mode (mirror across X or Z axis)
- Multi-select, copy/paste/move groups
- Layer visibility toggle for interior work

### Phase 3 — Buildable for Real
- BOM with exact piece counts sorted by color and size
- One-click export to BrickLink XML and Pick-a-Brick formats
- Estimated cost preview based on marketplace prices
- Step-by-step build instructions, layer by layer

### Phase 4 — Community
- User accounts and persistent build storage
- Public gallery with browsing, forking, and remixing
- Shareable URLs for individual builds
- Featured builds, weekly themes

## Principles to Respect

- **Speed of feedback is sacred.** If a user action takes more than 200ms to register, it feels broken.
- **The AI is a tool, not a magician.** Set expectations honestly about what gets generated. The user finishes the work.
- **No subscriptions until value is undeniable.** Free tier should be genuinely useful. Charge for premium (large builds, ordering integration, advanced AI).
- **The Lego brand is precious.** No affiliation claimed, no trademarked imagery used. The product is "Lego-compatible" — never "Lego."
- **Build the product, not the demo.** Every feature should hold up to repeat use, not just a single stage playthrough.

## Files in This Project

- `brick-lab.html` — the voxelizer prototype
- `brick-builder.html` — the manual editor prototype

Both validate pieces of the experience but neither is the product. The product is the unified flow described above.
