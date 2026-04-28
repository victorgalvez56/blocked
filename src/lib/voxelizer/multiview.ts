import { availableColors } from '@/lib/palette';
import { nearestBrickColor } from '@/lib/color/nearest-brick';
import { packBricks } from './brick-packer';
import { hollowGrid } from './hollow';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';
import type { ClientVoxelizeOpts } from './client-image-to-grid';
import type { RGB } from '@/lib/color/lab';

export interface MultiviewImages {
  front: HTMLImageElement;
  side?: HTMLImageElement | null;
  back?: HTMLImageElement | null;
  top?: HTMLImageElement | null;
}

interface MaskedView {
  mask: Uint8Array;
  rgb: Uint8ClampedArray;
  N: number;
}

function buildMaskedView(img: HTMLImageElement, N: number, bgThreshold: number): MaskedView {
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, N, N);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const scale = Math.min(N / img.width, N / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = (N - drawW) / 2;
  const dy = (N - drawH) / 2;
  ctx.drawImage(img, dx, dy, drawW, drawH);

  const data = ctx.getImageData(0, 0, N, N).data;

  const cornerAt = (px: number, py: number): RGB => {
    const i = (py * N + px) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners: RGB[] = [
    cornerAt(0, 0),
    cornerAt(N - 1, 0),
    cornerAt(0, N - 1),
    cornerAt(N - 1, N - 1),
  ];

  const mask = new Uint8Array(N * N);
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const i = (py * N + px) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      let isBg = a < 64;
      if (!isBg && bgThreshold > 0) {
        for (const c of corners) {
          const dr = c[0] - r;
          const dg = c[1] - g;
          const db = c[2] - b;
          if (Math.sqrt(dr * dr + dg * dg + db * db) < bgThreshold) {
            isBg = true;
            break;
          }
        }
      }
      mask[py * N + px] = isBg ? 0 : 1;
    }
  }

  return { mask, rgb: data, N };
}

function chamferEdgeDistance(mask: Uint8Array, N: number): Float32Array {
  const dist = new Int16Array(N * N);
  const INF = 9999;
  for (let i = 0; i < N * N; i++) dist[i] = mask[i] ? INF : 0;
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      if (!mask[py * N + px]) continue;
      let d = dist[py * N + px];
      if (px > 0) d = Math.min(d, dist[py * N + px - 1] + 1);
      if (py > 0) d = Math.min(d, dist[(py - 1) * N + px] + 1);
      dist[py * N + px] = d;
    }
  }
  for (let py = N - 1; py >= 0; py--) {
    for (let px = N - 1; px >= 0; px--) {
      if (!mask[py * N + px]) continue;
      let d = dist[py * N + px];
      if (px < N - 1) d = Math.min(d, dist[py * N + px + 1] + 1);
      if (py < N - 1) d = Math.min(d, dist[(py + 1) * N + px] + 1);
      dist[py * N + px] = d;
    }
  }
  let maxD = 0;
  for (let i = 0; i < N * N; i++) if (mask[i] && dist[i] > maxD) maxD = dist[i];
  const out = new Float32Array(N * N);
  if (maxD > 0) for (let i = 0; i < N * N; i++) if (mask[i]) out[i] = dist[i] / maxD;
  return out;
}

export function voxelizeMultiview(
  images: MultiviewImages,
  opts: ClientVoxelizeOpts,
): VoxelGridSnapshot {
  const N = Math.max(8, opts.resolution);

  const front = buildMaskedView(images.front, N, opts.backgroundThreshold);
  const side = images.side ? buildMaskedView(images.side, N, opts.backgroundThreshold) : null;
  const top = images.top ? buildMaskedView(images.top, N, opts.backgroundThreshold) : null;
  // back is intentionally unused — front drives both X×Y silhouette and color.

  // FRONT-DRIVEN BAS-RELIEF:
  //   - Front silhouette = X×Y mask + per-pixel color (principal, always required)
  //   - Per-pixel thickness from front edge distance (organic depth)
  //   - Side/top are OPTIONAL caps per row (y) and column (x): when absent,
  //     fraction defaults to 1.0 (no constraint) so a single front image still works
  //   - Bricks centered around midZ (mirror)
  //   - Back is ignored entirely
  const edge = chamferEdgeDistance(front.mask, N);

  const sideDepthFraction = new Float32Array(N);
  if (side) {
    for (let py = 0; py < N; py++) {
      let count = 0;
      for (let pz = 0; pz < N; pz++) if (side.mask[py * N + pz]) count++;
      sideDepthFraction[py] = count / N;
    }
  } else {
    sideDepthFraction.fill(1);
  }

  const topDepthFraction = new Float32Array(N);
  if (top) {
    for (let px = 0; px < N; px++) {
      let count = 0;
      for (let pz = 0; pz < N; pz++) if (top.mask[pz * N + px]) count++;
      topDepthFraction[px] = count / N;
    }
  } else {
    topDepthFraction.fill(1);
  }

  const palette = availableColors();
  const voxels: Voxel[] = [];
  const midZ = Math.floor(N / 2);

  // Cap thickness scale: take the GLOBAL max of side/top fractions as a sanity ceiling
  // (so we never extrude beyond what either auxiliary view ever shows). Floor at 0.25
  // so the build always has at least some volume even when side/top are noisy.
  let sideTopCeiling = 0;
  for (let i = 0; i < N; i++) {
    sideTopCeiling = Math.max(sideTopCeiling, sideDepthFraction[i], topDepthFraction[i]);
  }
  sideTopCeiling = Math.max(0.25, Math.min(1, sideTopCeiling));

  for (let y = 0; y < N; y++) {
    const py = N - 1 - y;
    for (let x = 0; x < N; x++) {
      if (!front.mask[py * N + x]) continue;

      const edgeFactor = edge[py * N + x]; // 0..1, 1 = deepest center of front silhouette
      // Local cap: smaller of side-row or top-col fraction (whichever auxiliary view
      // says "this slice is thinner" wins — front never gets thicker than the views allow).
      const localCap = Math.min(sideDepthFraction[py], topDepthFraction[x]);
      const localThickness = Math.max(localCap, 0.15); // never zero; tiny floor

      // Effective normalized thickness: edge-shaped, capped by side/top, capped by global ceiling.
      const norm = Math.min(edgeFactor + 0.25, localThickness, sideTopCeiling);
      // opts.density (0..100) is the user's piece-count lever — scales the Z thickness budget.
      const densityScale = Math.max(0, Math.min(100, opts.density)) / 100;
      const thickness = Math.max(1, Math.round(norm * N * densityScale));
      const half = Math.floor(thickness / 2);
      const zMin = Math.max(0, midZ - half);
      const zMax = Math.min(N - 1, midZ + (thickness - half - 1));

      const i = (py * N + x) * 4;
      const colorId = nearestBrickColor(
        [front.rgb[i], front.rgb[i + 1], front.rgb[i + 2]],
        palette,
      ).id;

      for (let z = zMin; z <= zMax; z++) {
        voxels.push({
          coord: [x, y, z],
          colorId,
          brickId: 'brick-1x1',
          rotation: 0,
        });
      }
    }
  }

  const snapshot: VoxelGridSnapshot = {
    size: { x: N, y: N, z: N },
    voxels,
    baseplate: { width: N + 2, depth: N + 2 },
  };

  let result = snapshot;
  if (opts.hollow) result = hollowGrid(result);
  if (opts.optimize) result = packBricks(result);
  return result;
}
