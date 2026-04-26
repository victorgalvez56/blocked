export type VoxelCoord = readonly [x: number, y: number, z: number];
export type VoxelKey = `${number},${number},${number}`;

export interface Voxel {
  coord: VoxelCoord;
  colorId: string;
  brickId: string;
  rotation: 0 | 90 | 180 | 270;
}

export interface VoxelGridSnapshot {
  size: { x: number; y: number; z: number };
  voxels: Voxel[];
  baseplate: { width: number; depth: number };
}
