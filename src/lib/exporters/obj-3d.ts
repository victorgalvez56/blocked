import { BRICK_UNIT, requireBrick } from '@/lib/bricks';
import { requireColor } from '@/lib/palette';
import type { Voxel, VoxelGridSnapshot } from '@/types/voxel.types';

export interface ObjExportResult {
  obj: string;
  mtl: string;
}

function brickBox(voxel: Voxel): {
  ox: number;
  oy: number;
  oz: number;
  w: number;
  h: number;
  d: number;
} {
  const { studMm, plateHeightMm, brickHeightMm } = BRICK_UNIT;
  const brick = requireBrick(voxel.brickId);
  const { studsX, studsZ, plateHeight } = brick.dimensions;
  const rot = voxel.rotation;
  return {
    ox: voxel.coord[0] * studMm,
    oy: voxel.coord[1] * brickHeightMm,
    oz: voxel.coord[2] * studMm,
    w: (rot === 90 || rot === 270 ? studsZ : studsX) * studMm,
    h: plateHeight * plateHeightMm,
    d: (rot === 90 || rot === 270 ? studsX : studsZ) * studMm,
  };
}

// Appends 8 vertices + 6 quad faces for a box. Returns next vOffset.
// Winding: CCW when viewed from outside (outward normals).
function appendBox(
  vLines: string[],
  fLines: string[],
  box: { ox: number; oy: number; oz: number; w: number; h: number; d: number },
  vOffset: number,
): number {
  const { ox, oy, oz, w, h, d } = box;
  vLines.push(`v ${ox} ${oy} ${oz}`);         // 0: min-x min-y min-z
  vLines.push(`v ${ox + w} ${oy} ${oz}`);     // 1: max-x min-y min-z
  vLines.push(`v ${ox + w} ${oy} ${oz + d}`); // 2: max-x min-y max-z
  vLines.push(`v ${ox} ${oy} ${oz + d}`);     // 3: min-x min-y max-z
  vLines.push(`v ${ox} ${oy + h} ${oz}`);     // 4: min-x max-y min-z
  vLines.push(`v ${ox + w} ${oy + h} ${oz}`); // 5: max-x max-y min-z
  vLines.push(`v ${ox + w} ${oy + h} ${oz + d}`); // 6: max-x max-y max-z
  vLines.push(`v ${ox} ${oy + h} ${oz + d}`); // 7: min-x max-y max-z

  const i = vOffset;
  fLines.push(`f ${i} ${i + 1} ${i + 2} ${i + 3}`);   // bottom -Y
  fLines.push(`f ${i + 4} ${i + 7} ${i + 6} ${i + 5}`); // top +Y
  fLines.push(`f ${i} ${i + 4} ${i + 5} ${i + 1}`);   // front -Z
  fLines.push(`f ${i + 2} ${i + 6} ${i + 7} ${i + 3}`); // back +Z
  fLines.push(`f ${i} ${i + 3} ${i + 7} ${i + 4}`);   // left -X
  fLines.push(`f ${i + 1} ${i + 5} ${i + 6} ${i + 2}`); // right +X

  return vOffset + 8;
}

function buildMtlEntry(colorId: string): string[] {
  const color = requireColor(colorId);
  const [r, g, b] = color.rgb.map((c) => (c / 255).toFixed(4));
  return [
    `newmtl mat_${colorId}`,
    `Ka 0.15 0.15 0.15`,
    `Kd ${r} ${g} ${b}`,
    `Ks 0.05 0.05 0.05`,
    `Ns 10`,
    `d 1`,
    '',
  ];
}

export function buildObjModel(snapshot: VoxelGridSnapshot): ObjExportResult {
  const byColor = new Map<string, Voxel[]>();
  for (const v of snapshot.voxels) {
    let arr = byColor.get(v.colorId);
    if (!arr) {
      arr = [];
      byColor.set(v.colorId, arr);
    }
    arr.push(v);
  }

  const objLines: string[] = [
    '# Blocked — Lego voxel model (mm units)',
    'mtllib blocked-build.mtl',
    '',
  ];
  const mtlLines: string[] = ['# Blocked — materials', ''];

  let vOffset = 1;

  for (const [colorId, voxels] of byColor) {
    const color = requireColor(colorId);
    mtlLines.push(...buildMtlEntry(colorId));

    const groupName = color.name.replace(/\s+/g, '_');
    objLines.push(`g ${groupName}`, `usemtl mat_${colorId}`);

    const vLines: string[] = [];
    const fLines: string[] = [];
    for (const voxel of voxels) {
      vOffset = appendBox(vLines, fLines, brickBox(voxel), vOffset);
    }

    objLines.push(...vLines, ...fLines, '');
  }

  return { obj: objLines.join('\n'), mtl: mtlLines.join('\n') };
}
