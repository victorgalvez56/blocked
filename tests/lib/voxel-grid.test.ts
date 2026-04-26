import { describe, expect, it } from 'vitest';
import { VoxelGrid } from '@/lib/voxel-grid';

describe('VoxelGrid', () => {
  it('starts empty', () => {
    const g = VoxelGrid.empty();
    expect(g.size()).toBe(0);
    expect(g.has([0, 0, 0])).toBe(false);
  });

  it('sets and reads voxels', () => {
    const g = VoxelGrid.empty();
    g.set([2, 0, 3], { colorId: 'red', brickId: 'brick-1x1', rotation: 0 });
    expect(g.size()).toBe(1);
    expect(g.has([2, 0, 3])).toBe(true);
    expect(g.get([2, 0, 3])?.colorId).toBe('red');
  });

  it('removes voxels', () => {
    const g = VoxelGrid.empty();
    g.set([0, 0, 0], { colorId: 'white', brickId: 'brick-1x1', rotation: 0 });
    expect(g.remove([0, 0, 0])).toBe(true);
    expect(g.remove([0, 0, 0])).toBe(false);
    expect(g.size()).toBe(0);
  });

  it('round-trips through snapshot', () => {
    const g = VoxelGrid.empty({ width: 8, depth: 8 });
    g.set([0, 0, 0], { colorId: 'red', brickId: 'brick-1x1', rotation: 0 });
    g.set([1, 0, 0], { colorId: 'blue', brickId: 'brick-1x1', rotation: 0 });
    g.set([1, 1, 0], { colorId: 'yellow', brickId: 'brick-1x1', rotation: 0 });
    const snap = g.toSnapshot();
    const restored = VoxelGrid.fromSnapshot(snap);
    expect(restored.size()).toBe(3);
    expect(restored.get([1, 1, 0])?.colorId).toBe('yellow');
    expect(restored.toSnapshot().baseplate).toEqual({ width: 8, depth: 8 });
  });

  it('clear empties the grid', () => {
    const g = VoxelGrid.empty();
    g.set([0, 0, 0], { colorId: 'red', brickId: 'brick-1x1', rotation: 0 });
    g.clear();
    expect(g.size()).toBe(0);
  });
});
