import type { BrickColor, BrickPalette } from '@/types/palette.types';
import { ciede2000, rgbToLab, weightedRgbDistance, type LAB, type RGB } from './lab';

export type ColorMetric = 'ciede2000' | 'weighted-rgb';

interface PaletteIndex {
  colors: BrickColor[];
  labs: LAB[];
}

const indexCache = new WeakMap<BrickPalette, PaletteIndex>();

function indexFor(palette: BrickPalette): PaletteIndex {
  let idx = indexCache.get(palette);
  if (!idx) {
    idx = {
      colors: palette,
      labs: palette.map((c) => rgbToLab(c.rgb)),
    };
    indexCache.set(palette, idx);
  }
  return idx;
}

export function nearestBrickColor(
  rgb: RGB,
  palette: BrickPalette,
  metric: ColorMetric = 'ciede2000',
): BrickColor {
  if (palette.length === 0) throw new Error('palette is empty');

  if (metric === 'weighted-rgb') {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const d = weightedRgbDistance(rgb, palette[i].rgb);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return palette[bestIdx];
  }

  const idx = indexFor(palette);
  const targetLab = rgbToLab(rgb);
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < idx.colors.length; i++) {
    const d = ciede2000(targetLab, idx.labs[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return idx.colors[bestIdx];
}

export function quantizeRgbToPalette(
  rgb: RGB,
  palette: BrickPalette,
  metric: ColorMetric = 'ciede2000',
): string {
  return nearestBrickColor(rgb, palette, metric).id;
}
