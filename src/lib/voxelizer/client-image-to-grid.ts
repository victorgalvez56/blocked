import { availableColors } from '@/lib/palette';
import { nearestLegoColor } from '@/lib/color/nearest-lego';
import { packBricks } from './brick-packer';
import { hollowGrid } from './hollow';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';
import type { RGB } from '@/lib/color/lab';

export type DepthMode = 'flat' | 'darkness' | 'brightness' | 'center' | 'edge';

export interface ClientVoxelizeOpts {
  resolution: number;
  maxDepth: number;
  backgroundThreshold: number;
  depthMode: DepthMode;
  mirror: boolean;
  usePalette: boolean;
  optimize: boolean;
  hollow: boolean;
}

export const DEFAULT_OPTS: ClientVoxelizeOpts = {
  resolution: 28,
  maxDepth: 4,
  backgroundThreshold: 50,
  depthMode: 'edge',
  mirror: true,
  usePalette: true,
  optimize: true,
  hollow: true,
};

export async function loadImageElement(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('failed to load image'));
    img.src = url;
  });
  return img;
}

function resizeToImageData(img: HTMLImageElement, gw: number, gh: number): ImageData {
  const cv = document.createElement('canvas');
  cv.width = gw;
  cv.height = gh;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, gw, gh);
  return ctx.getImageData(0, 0, gw, gh);
}

function corners(data: Uint8ClampedArray, gw: number, gh: number): RGB[] {
  const at = (px: number, py: number): RGB => {
    const i = (py * gw + px) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return [at(0, 0), at(gw - 1, 0), at(0, gh - 1), at(gw - 1, gh - 1)];
}

function isBackground(
  r: number,
  g: number,
  b: number,
  a: number,
  cs: RGB[],
  threshold: number,
): boolean {
  if (a < 64) return true;
  if (threshold === 0) return false;
  for (const c of cs) {
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    if (Math.sqrt(dr * dr + dg * dg + db * db) < threshold) return true;
  }
  return false;
}

function chamferEdgeDistance(isFG: Uint8Array, gw: number, gh: number): Float32Array {
  const dist = new Int16Array(gw * gh);
  const INF = 9999;
  for (let i = 0; i < gw * gh; i++) dist[i] = isFG[i] ? INF : 0;
  for (let py = 0; py < gh; py++) {
    for (let px = 0; px < gw; px++) {
      if (!isFG[py * gw + px]) continue;
      let d = dist[py * gw + px];
      if (px > 0) d = Math.min(d, dist[py * gw + px - 1] + 1);
      if (py > 0) d = Math.min(d, dist[(py - 1) * gw + px] + 1);
      dist[py * gw + px] = d;
    }
  }
  for (let py = gh - 1; py >= 0; py--) {
    for (let px = gw - 1; px >= 0; px--) {
      if (!isFG[py * gw + px]) continue;
      let d = dist[py * gw + px];
      if (px < gw - 1) d = Math.min(d, dist[py * gw + px + 1] + 1);
      if (py < gh - 1) d = Math.min(d, dist[(py + 1) * gw + px] + 1);
      dist[py * gw + px] = d;
    }
  }
  let maxD = 0;
  for (let i = 0; i < gw * gh; i++) if (isFG[i] && dist[i] > maxD) maxD = dist[i];
  const out = new Float32Array(gw * gh);
  if (maxD > 0) {
    for (let i = 0; i < gw * gh; i++) if (isFG[i]) out[i] = dist[i] / maxD;
  }
  return out;
}

export function voxelizeImage(img: HTMLImageElement, opts: ClientVoxelizeOpts): VoxelGridSnapshot {
  const aspect = img.width / img.height;
  let gw: number;
  let gh: number;
  if (aspect >= 1) {
    gw = opts.resolution;
    gh = Math.max(8, Math.round(opts.resolution / aspect));
  } else {
    gh = opts.resolution;
    gw = Math.max(8, Math.round(opts.resolution * aspect));
  }

  const imgData = resizeToImageData(img, gw, gh);
  const data = imgData.data;
  const cs = corners(data, gw, gh);
  const palette = availableColors();

  const isFG = new Uint8Array(gw * gh);
  const lum = new Float32Array(gw * gh);
  for (let py = 0; py < gh; py++) {
    for (let px = 0; px < gw; px++) {
      const i = (py * gw + px) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (!isBackground(r, g, b, a, cs, opts.backgroundThreshold)) {
        isFG[py * gw + px] = 1;
        lum[py * gw + px] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      }
    }
  }

  const edgeDepth =
    opts.depthMode === 'edge' || opts.depthMode === 'center'
      ? chamferEdgeDistance(isFG, gw, gh)
      : null;

  const cx = (gw - 1) / 2;
  const cy = (gh - 1) / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  const voxels: Voxel[] = [];

  for (let py = 0; py < gh; py++) {
    for (let px = 0; px < gw; px++) {
      if (!isFG[py * gw + px]) continue;
      const i = (py * gw + px) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = lum[py * gw + px];

      let h: number;
      switch (opts.depthMode) {
        case 'brightness':
          h = Math.max(1, Math.round(l * opts.maxDepth));
          break;
        case 'darkness':
          h = Math.max(1, Math.round((1 - l) * opts.maxDepth));
          break;
        case 'center': {
          const dx = px - cx;
          const dy = py - cy;
          const d = Math.sqrt(dx * dx + dy * dy) / maxDist;
          h = Math.max(1, Math.round((1 - d) * opts.maxDepth));
          break;
        }
        case 'edge':
          h = Math.max(1, Math.round((edgeDepth?.[py * gw + px] ?? 0.5) * opts.maxDepth));
          break;
        case 'flat':
        default:
          h = Math.max(1, Math.round(opts.maxDepth * 0.5));
      }

      const colorId = opts.usePalette ? nearestLegoColor([r, g, b], palette).id : nearestLegoColor([r, g, b], palette).id;

      const xWorld = px;
      const yWorld = gh - 1 - py;

      for (let z = 0; z < h; z++) {
        voxels.push({
          coord: [xWorld, yWorld, z],
          colorId,
          brickId: 'brick-1x1',
          rotation: 0,
        });
      }

      if (opts.mirror) {
        for (let z = 1; z < h; z++) {
          voxels.push({
            coord: [xWorld, yWorld, -z],
            colorId,
            brickId: 'brick-1x1',
            rotation: 0,
          });
        }
      }
    }
  }

  const minZ = opts.mirror ? -(opts.maxDepth - 1) : 0;
  const zRange = opts.maxDepth - minZ;
  const shifted: Voxel[] = voxels.map((v) => ({
    ...v,
    coord: [v.coord[0], v.coord[1], v.coord[2] - minZ],
  }));

  const snapshot: VoxelGridSnapshot = {
    size: { x: gw, y: gh, z: zRange },
    voxels: shifted,
    baseplate: {
      width: Math.max(gw + 2, 16),
      depth: Math.max(zRange + 2, 8),
    },
  };

  let result = snapshot;
  if (opts.hollow) result = hollowGrid(result);
  if (opts.optimize) result = packBricks(result);
  return result;
}
