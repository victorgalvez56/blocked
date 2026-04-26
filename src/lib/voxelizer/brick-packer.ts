import { BRICKS } from '@/lib/bricks';
import type { Voxel, VoxelGridSnapshot } from '@/types/voxel.types';

interface BrickCandidate {
  brickId: string;
  studsX: number;
  studsZ: number;
  rotation: 0 | 90;
}

function buildCandidates(): BrickCandidate[] {
  const out: BrickCandidate[] = [];
  for (const b of BRICKS) {
    if (b.type !== 'brick') continue;
    const { studsX, studsZ } = b.dimensions;
    out.push({ brickId: b.id, studsX, studsZ, rotation: 0 });
    if (studsX !== studsZ) {
      out.push({ brickId: b.id, studsX: studsZ, studsZ: studsX, rotation: 90 });
    }
  }
  out.sort((a, b) => {
    const areaA = a.studsX * a.studsZ;
    const areaB = b.studsX * b.studsZ;
    if (areaB !== areaA) return areaB - areaA;
    return Math.max(b.studsX, b.studsZ) - Math.max(a.studsX, a.studsZ);
  });
  return out;
}

const CANDIDATES = buildCandidates();

export function packBricks(snapshot: VoxelGridSnapshot): VoxelGridSnapshot {
  const { voxels, size } = snapshot;
  if (voxels.length === 0) return snapshot;

  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of voxels) {
    if (v.coord[2] < minZ) minZ = v.coord[2];
    if (v.coord[2] > maxZ) maxZ = v.coord[2];
  }
  const width = size.x;
  const depth = maxZ - minZ + 1;

  const byY = new Map<number, Voxel[]>();
  for (const v of voxels) {
    const y = v.coord[1];
    const arr = byY.get(y);
    if (arr) arr.push(v);
    else byY.set(y, [v]);
  }

  const newVoxels: Voxel[] = [];

  for (const [y, layer] of byY) {
    const cells: (string | null)[][] = Array.from({ length: width }, () =>
      new Array<string | null>(depth).fill(null),
    );
    for (const v of layer) {
      const cx = v.coord[0];
      const cz = v.coord[2] - minZ;
      if (cx >= 0 && cx < width && cz >= 0 && cz < depth) {
        cells[cx][cz] = v.colorId;
      }
    }

    const used: boolean[][] = Array.from({ length: width }, () =>
      new Array<boolean>(depth).fill(false),
    );

    for (let z = 0; z < depth; z++) {
      for (let x = 0; x < width; x++) {
        if (used[x][z]) continue;
        const color = cells[x][z];
        if (!color) continue;

        for (const cand of CANDIDATES) {
          if (x + cand.studsX > width || z + cand.studsZ > depth) continue;
          let fits = true;
          for (let dx = 0; dx < cand.studsX && fits; dx++) {
            for (let dz = 0; dz < cand.studsZ && fits; dz++) {
              if (used[x + dx][z + dz] || cells[x + dx][z + dz] !== color) {
                fits = false;
              }
            }
          }
          if (!fits) continue;

          for (let dx = 0; dx < cand.studsX; dx++) {
            for (let dz = 0; dz < cand.studsZ; dz++) {
              used[x + dx][z + dz] = true;
            }
          }
          newVoxels.push({
            coord: [x, y, z + minZ],
            colorId: color,
            brickId: cand.brickId,
            rotation: cand.rotation,
          });
          break;
        }
      }
    }
  }

  return { ...snapshot, voxels: newVoxels };
}
