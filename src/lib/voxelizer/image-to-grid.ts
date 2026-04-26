import 'server-only';
import sharp from 'sharp';
import { availableColors } from '@/lib/palette';
import { nearestLegoColor } from '@/lib/color/nearest-lego';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';
import type { BuildType } from '@/types/generation-job.types';
import type { RGB } from '@/lib/color/lab';

export interface VoxelizeOpts {
  buildType: BuildType;
  gridSize?: number;
  maxDepth?: number;
  backgroundThreshold?: number;
}

const DEFAULTS = {
  gridSize: 28,
  maxDepth: 3,
  backgroundThreshold: 50,
};

interface PixelInfo {
  rgb: RGB;
  isBackground: boolean;
}

function classifyPixel(
  rgb: RGB,
  bg: RGB,
  threshold: number,
): boolean {
  const dr = rgb[0] - bg[0];
  const dg = rgb[1] - bg[1];
  const db = rgb[2] - bg[2];
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  return dist < threshold;
}

function detectBackground(data: Buffer, width: number, height: number): RGB {
  const corners: RGB[] = [];
  const sampleAt = (x: number, y: number) => {
    const i = (y * width + x) * 3;
    corners.push([data[i], data[i + 1], data[i + 2]]);
  };
  sampleAt(0, 0);
  sampleAt(width - 1, 0);
  sampleAt(0, height - 1);
  sampleAt(width - 1, height - 1);
  sampleAt(Math.floor(width / 2), 0);
  sampleAt(Math.floor(width / 2), height - 1);
  const avg: [number, number, number] = [0, 0, 0];
  for (const c of corners) {
    avg[0] += c[0];
    avg[1] += c[1];
    avg[2] += c[2];
  }
  return [
    Math.round(avg[0] / corners.length),
    Math.round(avg[1] / corners.length),
    Math.round(avg[2] / corners.length),
  ];
}

function depthForPixel(rgb: RGB, buildType: BuildType, maxDepth: number): number {
  const lum = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) / 255;
  if (buildType === 'figure') {
    return maxDepth;
  }
  return Math.max(1, Math.round((1 - lum) * maxDepth));
}

export async function voxelizeImageFromUrl(
  imageUrl: string,
  opts: VoxelizeOpts,
): Promise<VoxelGridSnapshot> {
  const gridSize = opts.gridSize ?? DEFAULTS.gridSize;
  const maxDepth = opts.maxDepth ?? DEFAULTS.maxDepth;
  const bgThreshold = opts.backgroundThreshold ?? DEFAULTS.backgroundThreshold;

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`failed to fetch dall-e image: ${res.status}`);
  const inputBuf = Buffer.from(await res.arrayBuffer());

  const { data, info } = await sharp(inputBuf)
    .resize(gridSize, gridSize, { fit: 'contain', kernel: 'nearest', background: '#ffffff' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const bg = detectBackground(data, width, height);
  const palette = availableColors();

  const pixels: PixelInfo[][] = [];
  for (let y = 0; y < height; y++) {
    const row: PixelInfo[] = [];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
      row.push({ rgb, isBackground: classifyPixel(rgb, bg, bgThreshold) });
    }
    pixels.push(row);
  }

  const voxels: Voxel[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = pixels[y][x];
      if (px.isBackground) continue;
      const colorId = nearestLegoColor(px.rgb, palette).id;
      const depth = depthForPixel(px.rgb, opts.buildType, maxDepth);
      const worldY = height - 1 - y;
      for (let z = 0; z < depth; z++) {
        voxels.push({
          coord: [x, worldY, z],
          colorId,
          brickId: 'brick-1x1',
          rotation: 0,
        });
      }
    }
  }

  if (opts.buildType === 'diorama') {
    const baseRow = 0;
    const baseColor = nearestLegoColor([180, 180, 180], palette).id;
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < maxDepth; z++) {
        const has = voxels.some(
          (v) => v.coord[0] === x && v.coord[1] === baseRow && v.coord[2] === z,
        );
        if (!has) {
          voxels.push({
            coord: [x, baseRow, z],
            colorId: baseColor,
            brickId: 'brick-1x1',
            rotation: 0,
          });
        }
      }
    }
  }

  return {
    size: { x: width, y: height, z: maxDepth },
    voxels,
    baseplate: {
      width: Math.max(width + 2, 16),
      depth: Math.max(maxDepth + 2, 8),
    },
  };
}
