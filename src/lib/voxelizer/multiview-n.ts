'use client';

import * as THREE from 'three';
import { availableColors } from '@/lib/palette';
import { nearestBrickColor } from '@/lib/color/nearest-brick';
import { packBricks } from './brick-packer';
import { hollowGrid } from './hollow';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';
import type { ClientVoxelizeOpts } from './client-image-to-grid';
import type { RGB } from '@/lib/color/lab';

export interface ViewSpec {
  // Camera position is on the unit sphere of radius 1 (will be scaled by distance)
  // Camera looks toward origin; up vector defaults to (0,1,0) unless overridden.
  azimuth: number; // angle in radians around Y axis (0 = +Z = front, π/2 = +X = right)
  elevation: number; // 0 = equator, π/2 = top, -π/2 = bottom
  up?: [number, number, number];
  isColorSource?: boolean; // sample voxel colors from this view's image
}

interface MaskedView {
  mask: Uint8Array;
  rgb: Uint8ClampedArray;
  N: number;
  camera: THREE.OrthographicCamera;
  spec: ViewSpec;
}

function buildMaskFromImage(
  img: HTMLImageElement,
  N: number,
  bgThreshold: number,
): { mask: Uint8Array; rgb: Uint8ClampedArray } {
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
  ctx.drawImage(img, (N - drawW) / 2, (N - drawH) / 2, drawW, drawH);

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
  return { mask, rgb: data };
}

function buildCameraFor(spec: ViewSpec, gridSize: number): THREE.OrthographicCamera {
  // Subject occupies the volume centered at the origin spanning [-gridSize/2, gridSize/2]
  // For diagonal views the projected diagonal is sqrt(2) × wider, so we expand the frustum.
  const halfFrustum = (gridSize / 2) * Math.SQRT2 * 0.6;
  const distance = gridSize * 4;
  const camera = new THREE.OrthographicCamera(
    -halfFrustum,
    halfFrustum,
    halfFrustum,
    -halfFrustum,
    0.01,
    distance * 4,
  );
  const cosE = Math.cos(spec.elevation);
  const sinE = Math.sin(spec.elevation);
  const cosA = Math.cos(spec.azimuth);
  const sinA = Math.sin(spec.azimuth);
  // azimuth 0 = +Z (front)
  camera.position.set(
    distance * cosE * sinA,
    distance * sinE,
    distance * cosE * cosA,
  );
  camera.up.set(...(spec.up ?? [0, 1, 0]));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}

export function voxelizeMultiviewN(
  views: { image: HTMLImageElement; spec: ViewSpec }[],
  opts: ClientVoxelizeOpts,
): VoxelGridSnapshot {
  const N = Math.min(opts.resolution, 32);

  const masks: MaskedView[] = views.map((v) => {
    const { mask, rgb } = buildMaskFromImage(v.image, N, opts.backgroundThreshold);
    return {
      mask,
      rgb,
      N,
      camera: buildCameraFor(v.spec, N),
      spec: v.spec,
    };
  });

  // The view used for color sampling — first one flagged isColorSource, else views[0]
  const colorView = masks.find((m) => m.spec.isColorSource) ?? masks[0];

  const palette = availableColors();
  const tempVec = new THREE.Vector3();
  const voxels: Voxel[] = [];

  for (let z = 0; z < N; z++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        // Voxel center in world coords (centered around origin)
        const worldX = x - N / 2 + 0.5;
        const worldY = y - N / 2 + 0.5;
        const worldZ = z - N / 2 + 0.5;

        let inside = true;
        for (const view of masks) {
          tempVec.set(worldX, worldY, worldZ);
          tempVec.project(view.camera);
          // NDC [-1, 1] → pixel [0, N-1]
          const px = Math.floor(((tempVec.x + 1) / 2) * N);
          const py = Math.floor(((1 - tempVec.y) / 2) * N);
          if (px < 0 || px >= N || py < 0 || py >= N) {
            inside = false;
            break;
          }
          if (!view.mask[py * N + px]) {
            inside = false;
            break;
          }
        }
        if (!inside) continue;

        // Sample color from the dedicated color-source view
        tempVec.set(worldX, worldY, worldZ);
        tempVec.project(colorView.camera);
        const px = Math.floor(((tempVec.x + 1) / 2) * N);
        const py = Math.floor(((1 - tempVec.y) / 2) * N);
        const safeX = Math.max(0, Math.min(N - 1, px));
        const safeY = Math.max(0, Math.min(N - 1, py));
        const off = (safeY * N + safeX) * 4;
        const r = colorView.rgb[off];
        const g = colorView.rgb[off + 1];
        const b = colorView.rgb[off + 2];

        const colorId = nearestBrickColor([r, g, b], palette).id;
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

// Preset: 8 views at 45° intervals around the equator
// 0 = front (+Z), then rotating clockwise viewed from above
export const VIEWS_8: ViewSpec[] = [
  { azimuth: 0, elevation: 0, isColorSource: true },
  { azimuth: Math.PI / 4, elevation: 0 },
  { azimuth: Math.PI / 2, elevation: 0 },
  { azimuth: (3 * Math.PI) / 4, elevation: 0 },
  { azimuth: Math.PI, elevation: 0 },
  { azimuth: (5 * Math.PI) / 4, elevation: 0 },
  { azimuth: (3 * Math.PI) / 2, elevation: 0 },
  { azimuth: (7 * Math.PI) / 4, elevation: 0 },
];
