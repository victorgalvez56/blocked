import { availableColors } from '@/lib/palette';
import { nearestLegoColor } from '@/lib/color/nearest-lego';
import { packBricks } from './brick-packer';
import { hollowGrid } from './hollow';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';
import type { ClientVoxelizeOpts } from './client-image-to-grid';
import type { RGB } from '@/lib/color/lab';

export interface MultiviewImages {
  front: HTMLImageElement;
  side: HTMLImageElement;
  back: HTMLImageElement;
  top: HTMLImageElement;
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

export function voxelizeMultiview(
  images: MultiviewImages,
  opts: ClientVoxelizeOpts,
): VoxelGridSnapshot {
  const N = Math.min(opts.resolution, 32);

  const front = buildMaskedView(images.front, N, opts.backgroundThreshold);
  const side = buildMaskedView(images.side, N, opts.backgroundThreshold);
  const back = buildMaskedView(images.back, N, opts.backgroundThreshold);
  const top = buildMaskedView(images.top, N, opts.backgroundThreshold);

  // Carve: voxel survives only if all 4 silhouettes contain its projection
  const carved = new Uint8Array(N * N * N);
  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      const py = N - 1 - y;
      for (let x = 0; x < N; x++) {
        if (!front.mask[py * N + x]) continue;
        if (!back.mask[py * N + (N - 1 - x)]) continue;
        if (!side.mask[py * N + z]) continue;
        const tpy = N - 1 - z;
        if (!top.mask[tpy * N + x]) continue;
        carved[z * N * N + y * N + x] = 1;
      }
    }
  }

  const palette = availableColors();
  const voxels: Voxel[] = [];

  const idxOf = (x: number, y: number, z: number) => z * N * N + y * N + x;

  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = idxOf(x, y, z);
        if (!carved[idx]) continue;

        // Pick color from the most-relevant exposed face
        let pr = 0;
        let pg = 0;
        let pb = 0;
        const py = N - 1 - y;

        const frontExposed = z === 0 || !carved[idxOf(x, y, z - 1)];
        const backExposed = z === N - 1 || !carved[idxOf(x, y, z + 1)];
        const rightExposed = x === N - 1 || !carved[idxOf(x + 1, y, z)];
        const leftExposed = x === 0 || !carved[idxOf(x - 1, y, z)];
        const topExposed = y === N - 1 || !carved[idxOf(x, y + 1, z)];

        if (frontExposed) {
          const i = (py * N + x) * 4;
          pr = front.rgb[i];
          pg = front.rgb[i + 1];
          pb = front.rgb[i + 2];
        } else if (backExposed) {
          const i = (py * N + (N - 1 - x)) * 4;
          pr = back.rgb[i];
          pg = back.rgb[i + 1];
          pb = back.rgb[i + 2];
        } else if (rightExposed) {
          const i = (py * N + z) * 4;
          pr = side.rgb[i];
          pg = side.rgb[i + 1];
          pb = side.rgb[i + 2];
        } else if (leftExposed) {
          const i = (py * N + (N - 1 - z)) * 4;
          pr = side.rgb[i];
          pg = side.rgb[i + 1];
          pb = side.rgb[i + 2];
        } else if (topExposed) {
          const tpy = N - 1 - z;
          const i = (tpy * N + x) * 4;
          pr = top.rgb[i];
          pg = top.rgb[i + 1];
          pb = top.rgb[i + 2];
        } else {
          const i = (py * N + x) * 4;
          pr = front.rgb[i];
          pg = front.rgb[i + 1];
          pb = front.rgb[i + 2];
        }

        const colorId = nearestLegoColor([pr, pg, pb], palette).id;
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
