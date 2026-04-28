'use client';

import * as THREE from 'three';
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
  MeshBVH,
} from 'three-mesh-bvh';
import { availableColors } from '@/lib/palette';
import { nearestBrickColor } from '@/lib/color/nearest-brick';
import { packBricks } from './brick-packer';
import { hollowGrid } from './hollow';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';

const patched = { current: false };

function patchThree(): void {
  if (patched.current) return;
  (THREE.BufferGeometry.prototype as unknown as Record<string, unknown>).computeBoundsTree =
    computeBoundsTree;
  (THREE.BufferGeometry.prototype as unknown as Record<string, unknown>).disposeBoundsTree =
    disposeBoundsTree;
  (THREE.Mesh.prototype as unknown as Record<string, unknown>).raycast = acceleratedRaycast;
  patched.current = true;
}

export interface MeshToVoxelOpts {
  resolution: number;
  hollow: boolean;
  optimize: boolean;
}

export const DEFAULT_MESH_OPTS: MeshToVoxelOpts = {
  resolution: 28,
  hollow: true,
  optimize: true,
};

function materialColor(material: THREE.Material | THREE.Material[]): [number, number, number] {
  const m = Array.isArray(material) ? material[0] : material;
  const c = (m as { color?: THREE.Color }).color;
  if (!c) return [180, 180, 180];
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

interface TextureSampler {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  dominantColors: Array<[number, number, number]>;
}

function extractDominantColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  topN: number,
): Array<[number, number, number]> {
  // Bucket pixels into 6×6×6 = 216 RGB buckets, ignoring near-white (likely background)
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const total = width * height;
  const stride = Math.max(1, Math.floor(total / 16384)); // sample at most ~16k pixels
  for (let i = 0; i < total; i += stride) {
    const off = i * 4;
    const r = data[off];
    const g = data[off + 1];
    const b = data[off + 2];
    const a = data[off + 3];
    if (a < 64) continue;
    // Skip near-white background (>240 on all channels)
    if (r > 240 && g > 240 && b > 240) continue;
    const qr = Math.floor(r / 43);
    const qg = Math.floor(g / 43);
    const qb = Math.floor(b / 43);
    const key = `${qr},${qg},${qb}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }
  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  return sorted.slice(0, topN).map(
    (s) => [s.r / s.count, s.g / s.count, s.b / s.count] as [number, number, number],
  );
}

function nearestDominant(
  rgb: [number, number, number],
  dominants: Array<[number, number, number]>,
): [number, number, number] {
  if (dominants.length === 0) return rgb;
  let best = dominants[0];
  let bestDist = Infinity;
  for (const d of dominants) {
    const dr = rgb[0] - d[0];
    const dg = rgb[1] - d[1];
    const db = rgb[2] - d[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return best;
}

function buildTextureSampler(material: THREE.Material | THREE.Material[]): TextureSampler | null {
  const m = Array.isArray(material) ? material[0] : material;
  const map = (m as { map?: THREE.Texture | null }).map;
  if (!map?.image) return null;
  try {
    const img = map.image as HTMLImageElement | ImageBitmap | HTMLCanvasElement;
    const w = (img as HTMLImageElement).width || 256;
    const h = (img as HTMLImageElement).height || 256;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const dominantColors = extractDominantColors(data, w, h, 10);
    return { data, width: w, height: h, dominantColors };
  } catch {
    return null;
  }
}

function barycentric(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): { u: number; v: number; w: number } {
  const v0 = new THREE.Vector3().subVectors(b, a);
  const v1 = new THREE.Vector3().subVectors(c, a);
  const v2 = new THREE.Vector3().subVectors(p, a);
  const d00 = v0.dot(v0);
  const d01 = v0.dot(v1);
  const d11 = v1.dot(v1);
  const d20 = v2.dot(v0);
  const d21 = v2.dot(v1);
  const denom = d00 * d11 - d01 * d01;
  if (denom === 0) return { u: 1, v: 0, w: 0 };
  const v = (d11 * d20 - d01 * d21) / denom;
  const w = (d00 * d21 - d01 * d20) / denom;
  const u = 1 - v - w;
  return { u, v, w };
}

function sampleSurface(
  point: THREE.Vector3,
  meshes: THREE.Mesh[],
  bvhs: Map<THREE.Mesh, MeshBVH>,
  textures: Map<THREE.Mesh, TextureSampler | null>,
  defaults: Map<THREE.Mesh, [number, number, number]>,
): [number, number, number] {
  let bestDist = Infinity;
  let bestRgb: [number, number, number] = [180, 180, 180];

  const tempLocal = new THREE.Vector3();
  const inverseMatrix = new THREE.Matrix4();
  const target = { point: new THREE.Vector3(), faceIndex: 0, distance: 0 };

  for (const mesh of meshes) {
    const bvh = bvhs.get(mesh);
    if (!bvh) continue;
    inverseMatrix.copy(mesh.matrixWorld).invert();
    tempLocal.copy(point).applyMatrix4(inverseMatrix);
    const closest = bvh.closestPointToPoint(tempLocal, target);
    if (!closest) continue;
    if (closest.distance < bestDist) {
      bestDist = closest.distance;

      const tex = textures.get(mesh);
      if (
        tex &&
        mesh.geometry.attributes.uv &&
        mesh.geometry.index &&
        closest.faceIndex !== undefined
      ) {
        const idx = mesh.geometry.index;
        const aI = idx.getX(closest.faceIndex * 3);
        const bI = idx.getX(closest.faceIndex * 3 + 1);
        const cI = idx.getX(closest.faceIndex * 3 + 2);
        const positionAttr = mesh.geometry.attributes.position;
        const va = new THREE.Vector3().fromBufferAttribute(positionAttr, aI);
        const vb = new THREE.Vector3().fromBufferAttribute(positionAttr, bI);
        const vc = new THREE.Vector3().fromBufferAttribute(positionAttr, cI);
        const bary = barycentric(closest.point, va, vb, vc);
        const uvAttr = mesh.geometry.attributes.uv as THREE.BufferAttribute;
        const ua = new THREE.Vector2().fromBufferAttribute(uvAttr, aI);
        const ub = new THREE.Vector2().fromBufferAttribute(uvAttr, bI);
        const uc = new THREE.Vector2().fromBufferAttribute(uvAttr, cI);
        const u = ua.x * bary.u + ub.x * bary.v + uc.x * bary.w;
        const v = ua.y * bary.u + ub.y * bary.v + uc.y * bary.w;
        const cx = Math.floor(u * tex.width);
        const cy = Math.floor((1 - v) * tex.height);
        // 5×5 neighborhood average smooths baked-shading and texture noise
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let count = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const px = Math.max(0, Math.min(tex.width - 1, cx + dx));
            const py = Math.max(0, Math.min(tex.height - 1, cy + dy));
            const off = (py * tex.width + px) * 4;
            sr += tex.data[off];
            sg += tex.data[off + 1];
            sb += tex.data[off + 2];
            count++;
          }
        }
        const avg: [number, number, number] = [sr / count, sg / count, sb / count];
        // Snap to a dominant texture color first — kills lighting/shadow noise.
        // Then nearestBrickColor maps the dominant to the closest brick color.
        bestRgb = nearestDominant(avg, tex.dominantColors);
      } else {
        bestRgb = defaults.get(mesh) ?? [180, 180, 180];
      }
    }
  }

  return bestRgb;
}

export async function meshToVoxelGrid(
  scene: THREE.Object3D,
  opts: Partial<MeshToVoxelOpts> = {},
  onProgress?: (pct: number) => void,
): Promise<VoxelGridSnapshot> {
  patchThree();
  const o: MeshToVoxelOpts = { ...DEFAULT_MESH_OPTS, ...opts };

  const meshes: THREE.Mesh[] = [];
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry?.attributes?.position) {
      meshes.push(obj);
    }
  });
  if (meshes.length === 0) {
    return { size: { x: 0, y: 0, z: 0 }, voxels: [], baseplate: { width: 16, depth: 16 } };
  }

  // Filter out tiny "shadow" / helper meshes the AI sometimes emits — keep substantial ones only
  let totalVerts = 0;
  for (const m of meshes) totalVerts += m.geometry.attributes.position.count;
  const minVerts = Math.max(50, Math.floor(totalVerts * 0.05));
  const filteredMeshes = meshes.filter(
    (m) => m.geometry.attributes.position.count >= minVerts,
  );
  if (filteredMeshes.length === 0) filteredMeshes.push(meshes[0]);

  scene.updateMatrixWorld(true);

  const bbox = new THREE.Box3();
  for (const m of filteredMeshes) bbox.expandByObject(m);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim === 0) {
    return { size: { x: 0, y: 0, z: 0 }, voxels: [], baseplate: { width: 16, depth: 16 } };
  }

  const Nx = Math.max(1, Math.round((size.x / maxDim) * o.resolution));
  const Ny = Math.max(1, Math.round((size.y / maxDim) * o.resolution));
  const Nz = Math.max(1, Math.round((size.z / maxDim) * o.resolution));
  const cellSize = maxDim / o.resolution;

  const bvhs = new Map<THREE.Mesh, MeshBVH>();
  const defaults = new Map<THREE.Mesh, [number, number, number]>();
  const textures = new Map<THREE.Mesh, TextureSampler | null>();
  for (const mesh of filteredMeshes) {
    bvhs.set(mesh, new MeshBVH(mesh.geometry));
    defaults.set(mesh, materialColor(mesh.material));
    textures.set(mesh, buildTextureSampler(mesh.material));
  }

  const palette = availableColors();
  const raycaster = new THREE.Raycaster();
  const rayDirs = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  const point = new THREE.Vector3();
  const voxels: Voxel[] = [];

  for (let iy = 0; iy < Ny; iy++) {
    for (let iz = 0; iz < Nz; iz++) {
      for (let ix = 0; ix < Nx; ix++) {
        point.set(
          bbox.min.x + (ix + 0.5) * cellSize,
          bbox.min.y + (iy + 0.5) * cellSize,
          bbox.min.z + (iz + 0.5) * cellSize,
        );

        // Multi-ray inside test with early exit
        let votes = 0;
        let antiVotes = 0;
        for (const dir of rayDirs) {
          let totalHits = 0;
          for (const mesh of filteredMeshes) {
            raycaster.set(point, dir);
            totalHits += raycaster.intersectObject(mesh, false).length;
          }
          if (totalHits % 2 === 1) {
            votes++;
            if (votes >= 2) break;
          } else {
            antiVotes++;
            if (antiVotes >= 2) break;
          }
        }
        if (votes < 2) continue;

        const rgb = sampleSurface(point, filteredMeshes, bvhs, textures, defaults);
        const colorId = nearestBrickColor(rgb, palette).id;

        voxels.push({
          coord: [ix, iy, iz],
          colorId,
          brickId: 'brick-1x1',
          rotation: 0,
        });
      }
    }

    // Yield to the browser so the UI stays responsive
    if (iy % 2 === 1 || iy === Ny - 1) {
      onProgress?.(iy / (Ny - 1));
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  for (const mesh of filteredMeshes) {
    if (mesh.geometry.boundsTree) {
      (mesh.geometry as unknown as { disposeBoundsTree: () => void }).disposeBoundsTree();
    }
  }

  // Drop tiny disconnected fragments — keep only the largest connected component
  const filtered = keepLargestComponent(voxels);

  let snapshot: VoxelGridSnapshot = {
    size: { x: Nx, y: Ny, z: Nz },
    voxels: filtered,
    baseplate: {
      width: Math.max(Nx + 2, 16),
      depth: Math.max(Nz + 2, 8),
    },
  };

  if (o.hollow) snapshot = hollowGrid(snapshot);
  if (o.optimize) snapshot = packBricks(snapshot);
  return snapshot;
}

function keepLargestComponent(voxels: Voxel[]): Voxel[] {
  if (voxels.length === 0) return voxels;
  const idxOf = new Map<string, number>();
  for (let i = 0; i < voxels.length; i++) {
    const v = voxels[i];
    idxOf.set(`${v.coord[0]},${v.coord[1]},${v.coord[2]}`, i);
  }
  const visited = new Uint8Array(voxels.length);
  const components: number[][] = [];

  for (let i = 0; i < voxels.length; i++) {
    if (visited[i]) continue;
    const stack = [i];
    const comp: number[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited[cur]) continue;
      visited[cur] = 1;
      comp.push(cur);
      const [x, y, z] = voxels[cur].coord;
      const neighbors = [
        `${x + 1},${y},${z}`,
        `${x - 1},${y},${z}`,
        `${x},${y + 1},${z}`,
        `${x},${y - 1},${z}`,
        `${x},${y},${z + 1}`,
        `${x},${y},${z - 1}`,
      ];
      for (const k of neighbors) {
        const ni = idxOf.get(k);
        if (ni !== undefined && !visited[ni]) stack.push(ni);
      }
    }
    components.push(comp);
  }

  components.sort((a, b) => b.length - a.length);
  const largest = components[0];
  if (largest.length === voxels.length) return voxels;
  return largest.map((i) => voxels[i]);
}
