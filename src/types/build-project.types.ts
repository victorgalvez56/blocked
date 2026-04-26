import type { VoxelGridSnapshot } from './voxel.types';
import type { BuildType } from './generation-job.types';

export interface BuildProject {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  buildType: BuildType;
  reference: { imageUrl: string; prompt: string };
  grid: VoxelGridSnapshot;
  paletteVersion: string;
  schemaVersion: 1;
}
