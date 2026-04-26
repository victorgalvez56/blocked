import { describe, expect, it } from 'vitest';
import { nearestLegoColor } from '@/lib/color/nearest-lego';
import { PALETTE } from '@/lib/palette';

describe('nearestLegoColor', () => {
  it('snaps pure red to a red palette entry', () => {
    const c = nearestLegoColor([255, 0, 0], PALETTE);
    expect(c.id).toMatch(/red/);
  });

  it('snaps pure black to black', () => {
    const c = nearestLegoColor([0, 0, 0], PALETTE);
    expect(c.id).toBe('black');
  });

  it('snaps near-white to white', () => {
    const c = nearestLegoColor([250, 250, 250], PALETTE);
    expect(c.id).toBe('white');
  });

  it('weighted-rgb metric also returns a palette member', () => {
    const c = nearestLegoColor([120, 200, 80], PALETTE, 'weighted-rgb');
    expect(PALETTE.some((p) => p.id === c.id)).toBe(true);
  });

  it('throws on empty palette', () => {
    expect(() => nearestLegoColor([0, 0, 0], [])).toThrow();
  });
});
