import type { VoxelGridSnapshot } from '@/types/voxel.types';

export function hollowGrid(snapshot: VoxelGridSnapshot): VoxelGridSnapshot {
  if (snapshot.voxels.length === 0) return snapshot;

  const occupied = new Set<string>();
  for (const v of snapshot.voxels) {
    occupied.add(`${v.coord[0]},${v.coord[1]},${v.coord[2]}`);
  }

  const surface = snapshot.voxels.filter((v) => {
    const [x, y, z] = v.coord;
    return !(
      occupied.has(`${x + 1},${y},${z}`) &&
      occupied.has(`${x - 1},${y},${z}`) &&
      occupied.has(`${x},${y + 1},${z}`) &&
      occupied.has(`${x},${y - 1},${z}`) &&
      occupied.has(`${x},${y},${z + 1}`) &&
      occupied.has(`${x},${y},${z - 1}`)
    );
  });

  return { ...snapshot, voxels: surface };
}
