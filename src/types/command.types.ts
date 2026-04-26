import type { VoxelGrid } from '@/lib/voxel-grid';

export interface Command {
  do(grid: VoxelGrid): void;
  undo(grid: VoxelGrid): void;
  label: string;
}
