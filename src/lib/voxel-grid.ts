import type { Voxel, VoxelCoord, VoxelGridSnapshot, VoxelKey } from '@/types/voxel.types';

const keyOf = ([x, y, z]: VoxelCoord): VoxelKey => `${x},${y},${z}`;

export class VoxelGrid {
  private readonly cells = new Map<VoxelKey, Voxel>();
  private bounds = { x: 0, y: 0, z: 0 };
  private baseplate: { width: number; depth: number };

  constructor(baseplate: { width: number; depth: number } = { width: 16, depth: 16 }) {
    this.baseplate = baseplate;
  }

  set(coord: VoxelCoord, v: Omit<Voxel, 'coord'>): void {
    this.cells.set(keyOf(coord), { coord, ...v });
    if (coord[0] >= this.bounds.x) this.bounds.x = coord[0] + 1;
    if (coord[1] >= this.bounds.y) this.bounds.y = coord[1] + 1;
    if (coord[2] >= this.bounds.z) this.bounds.z = coord[2] + 1;
  }

  remove(coord: VoxelCoord): boolean {
    return this.cells.delete(keyOf(coord));
  }

  get(coord: VoxelCoord): Voxel | undefined {
    return this.cells.get(keyOf(coord));
  }

  has(coord: VoxelCoord): boolean {
    return this.cells.has(keyOf(coord));
  }

  clear(): void {
    this.cells.clear();
    this.bounds = { x: 0, y: 0, z: 0 };
  }

  size(): number {
    return this.cells.size;
  }

  toArray(): Voxel[] {
    return Array.from(this.cells.values());
  }

  toSnapshot(): VoxelGridSnapshot {
    return {
      size: { ...this.bounds },
      voxels: this.toArray(),
      baseplate: { ...this.baseplate },
    };
  }

  static fromSnapshot(snapshot: VoxelGridSnapshot): VoxelGrid {
    const grid = new VoxelGrid(snapshot.baseplate);
    for (const v of snapshot.voxels) {
      grid.set(v.coord, { colorId: v.colorId, brickId: v.brickId, rotation: v.rotation });
    }
    return grid;
  }

  static empty(baseplate?: { width: number; depth: number }): VoxelGrid {
    return new VoxelGrid(baseplate);
  }
}
