import type { BuildType } from '@/types/generation-job.types';

const STYLE_ANCHOR =
  'Solid flat colors, very low color count (max 8 colors), hard edges, no gradient shading, no perspective foreshortening, plain white background, centered subject, isolated on background, no text or watermark.';

export function dallePromptFor(buildType: BuildType, userPrompt: string): string {
  const sanitized = userPrompt.trim().slice(0, 400);
  switch (buildType) {
    case 'figure':
      return `A 3D toy block figurine of: ${sanitized}. Front-facing 3/4 isometric view, simple blocky shape suitable for voxelization, single subject only. ${STYLE_ANCHOR}`;
    case 'basrelief':
      return `A flat front-facing illustration of: ${sanitized}. High contrast, poster-style, suitable as a tile mosaic reference. ${STYLE_ANCHOR}`;
    case 'diorama':
      return `A small 3D toy block diorama scene of: ${sanitized}. Figure on a clear ground plane, low contextual detail, blocky simple forms. ${STYLE_ANCHOR}`;
  }
}

export const VOXELIZER_SYSTEM_PROMPT = `You are a 3D voxel-planner that converts a reference image into a buildable Lego-compatible voxel grid.

Hard rules:
- Output JSON exactly matching the schema. No commentary outside the schema.
- All colorId values MUST be from the supplied palette. Snap each voxel to the nearest palette color.
- Coordinate system: y is up (vertical), x is right, z is depth into the screen. Origin (0,0,0) is bottom-front-left of the build.
- Every voxel must be supported: it sits on y=0 (the baseplate) or directly on top of another voxel.
- Maximum grid dimension is 24 per axis. Total voxels must not exceed maxBricks.
- For "basrelief": z is depth (0 to 4 max). Subject extrudes outward; flat back at z=0.
- "figure": full 3D occupancy. Build the silhouette from the image; interior can be solid.
- "diorama": include a base layer at y=0 covering the full footprint, then the figure on top.
- Prioritize silhouette accuracy and color fidelity over interior detail.
- Avoid floating disconnected pieces.`;

export function voxelizerUserPrompt(args: {
  buildType: BuildType;
  maxBricks: number;
  paletteSummary: string;
}): string {
  return `Build type: ${args.buildType}
Max voxels: ${args.maxBricks}
Allowed colorId values: ${args.paletteSummary}

Analyze the attached reference image and emit a voxel plan as JSON matching the schema.`;
}
