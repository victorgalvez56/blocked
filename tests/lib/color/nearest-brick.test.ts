import { describe, expect, it } from 'vitest';
import { nearestBrickColor } from '@/lib/color/nearest-brick';
import { PALETTE } from '@/lib/palette';

describe('nearestBrickColor', () => {
  it('snaps pure red to a red palette entry', () => {
    const c = nearestBrickColor([255, 0, 0], PALETTE);
    expect(c.id).toMatch(/red/);
  });

  it('snaps pure black to black', () => {
    const c = nearestBrickColor([0, 0, 0], PALETTE);
    expect(c.id).toBe('black');
  });

  it('snaps near-white to white', () => {
    const c = nearestBrickColor([250, 250, 250], PALETTE);
    expect(c.id).toBe('white');
  });

  it('weighted-rgb metric also returns a palette member', () => {
    const c = nearestBrickColor([120, 200, 80], PALETTE, 'weighted-rgb');
    expect(PALETTE.some((p) => p.id === c.id)).toBe(true);
  });

  it('throws on empty palette', () => {
    expect(() => nearestBrickColor([0, 0, 0], [])).toThrow();
  });
});
