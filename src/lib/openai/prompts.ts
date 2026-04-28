import type { BuildType } from '@/types/generation-job.types';

const STYLE_ANCHOR =
  'Voxel art style, blocky cube-based geometry, like a Minecraft or MagicaVoxel render. Solid flat colors only — no gradient shading, no smooth surfaces, no anti-aliasing, no soft lighting. Maximum 6 distinct colors total. Hard pixelated edges. Pure white seamless background. Single isolated subject perfectly centered with margin. Simple iconic silhouette. No text, no watermark, no logos, no shadows on the background. Render at low resolution feel — chunky pixels, ~32x32 effective grid.';

export function dallePromptFor(buildType: BuildType, userPrompt: string): string {
  const sanitized = userPrompt.trim().slice(0, 200);
  switch (buildType) {
    case 'figure':
      return `Voxel art of a single ${sanitized}, front-facing view, body fully visible from head to feet, fits within frame with margin. ${STYLE_ANCHOR}`;
    case 'basrelief':
      return `Voxel art icon of ${sanitized}, flat front-facing pose, simple readable silhouette like a video game sprite. ${STYLE_ANCHOR}`;
    case 'diorama':
      return `Voxel art of ${sanitized} standing on a small simple base, front-facing 3/4 view. ${STYLE_ANCHOR}`;
  }
}

export const VOXELIZER_SYSTEM_PROMPT = `You are a 3D voxel-planner that converts a reference image into a buildable voxel grid.

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
