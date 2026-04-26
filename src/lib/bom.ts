import { getBrick } from '@/lib/bricks';
import { getColor } from '@/lib/palette';
import type { Bom, BomLine } from '@/types/bom.types';
import type { VoxelGridSnapshot } from '@/types/voxel.types';

export interface BomEntry extends BomLine {
  key: string;
  brickLabel: string;
  colorName: string;
  colorHex: string;
  area: number;
}

export function buildBomEntries(snapshot: VoxelGridSnapshot): BomEntry[] {
  const counts = new Map<string, number>();
  for (const v of snapshot.voxels) {
    const key = `${v.brickId}|${v.colorId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const entries: BomEntry[] = [];
  for (const [key, count] of counts) {
    const [brickId, colorId] = key.split('|');
    const brickDef = getBrick(brickId);
    const color = getColor(colorId);
    const dims = brickDef?.dimensions;
    const brickLabel = dims
      ? `${dims.studsX}×${dims.studsZ} ${brickDef!.type === 'plate' ? 'Plate' : 'Brick'}`
      : brickId;
    entries.push({
      key,
      brickId,
      colorId,
      count,
      bricklinkPartId: brickDef?.bricklinkPartId ?? null,
      bricklinkColorId: color?.bricklinkId ?? null,
      brickLabel,
      colorName: color?.name ?? colorId,
      colorHex: color ? `#${color.hex}` : '#888888',
      area: (dims?.studsX ?? 1) * (dims?.studsZ ?? 1),
    });
  }

  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if (b.area !== a.area) return b.area - a.area;
    return a.brickLabel.localeCompare(b.brickLabel);
  });

  return entries;
}

export function buildBom(snapshot: VoxelGridSnapshot): Bom {
  const entries = buildBomEntries(snapshot);
  return {
    lines: entries.map((e) => ({
      brickId: e.brickId,
      colorId: e.colorId,
      count: e.count,
      bricklinkPartId: e.bricklinkPartId,
      bricklinkColorId: e.bricklinkColorId,
    })),
    totalPieces: entries.reduce((sum, e) => sum + e.count, 0),
    totalUniqueParts: entries.length,
  };
}
