import { z } from 'zod';
import { paletteIds } from '@/lib/palette';

const PALETTE_IDS = paletteIds();

const voxelSchema = z.object({
  coord: z.tuple([
    z.number().int().min(0).max(31),
    z.number().int().min(0).max(31),
    z.number().int().min(0).max(31),
  ]),
  colorId: z.string().refine((id) => PALETTE_IDS.includes(id), {
    message: 'colorId must be a known Lego palette id',
  }),
  brickId: z.string().default('brick-1x1'),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
});

export const voxelGridSnapshotSchema = z.object({
  size: z.object({
    x: z.number().int().min(1).max(32),
    y: z.number().int().min(1).max(32),
    z: z.number().int().min(1).max(32),
  }),
  voxels: z.array(voxelSchema).max(500),
  baseplate: z.object({
    width: z.number().int().min(8).max(48),
    depth: z.number().int().min(8).max(48),
  }),
});

export type VoxelPlan = z.infer<typeof voxelGridSnapshotSchema>;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateGravity(plan: VoxelPlan): ValidationResult {
  const errors: string[] = [];
  const occupied = new Set(plan.voxels.map((v) => `${v.coord[0]},${v.coord[1]},${v.coord[2]}`));
  for (const v of plan.voxels) {
    const [x, y, z] = v.coord;
    if (y === 0) continue;
    const below = `${x},${y - 1},${z}`;
    if (!occupied.has(below)) {
      errors.push(`floating voxel at (${x},${y},${z}) — no support below`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export interface CleanResult {
  cleaned: VoxelPlan;
  warnings: string[];
  droppedCount: number;
}

export function cleanVoxelPlan(plan: VoxelPlan): CleanResult {
  let voxels = [...plan.voxels];
  const warnings: string[] = [];
  let changed = true;
  let pass = 0;
  while (changed && pass < 8) {
    changed = false;
    pass++;
    const occupied = new Set(voxels.map((v) => `${v.coord[0]},${v.coord[1]},${v.coord[2]}`));
    const next = voxels.filter((v) => {
      const [x, y, z] = v.coord;
      if (y === 0) return true;
      if (occupied.has(`${x},${y - 1},${z}`)) return true;
      warnings.push(`dropped floating voxel at (${x},${y},${z})`);
      changed = true;
      return false;
    });
    voxels = next;
  }
  return {
    cleaned: { ...plan, voxels },
    warnings,
    droppedCount: plan.voxels.length - voxels.length,
  };
}

export function parseVoxelPlan(plan: unknown): { plan: VoxelPlan } | { error: string } {
  const parsed = voxelGridSnapshotSchema.safeParse(plan);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }
  return { plan: parsed.data };
}

export function validateVoxelPlan(plan: unknown): ValidationResult {
  const parsed = voxelGridSnapshotSchema.safeParse(plan);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  return validateGravity(parsed.data);
}
