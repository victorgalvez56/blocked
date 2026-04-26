import type { LegoColor, LegoPalette } from '@/types/palette.types';
import { ciede2000, rgbToLab, weightedRgbDistance, type LAB, type RGB } from './lab';

export type ColorMetric = 'ciede2000' | 'weighted-rgb';

interface PaletteIndex {
  colors: LegoColor[];
  labs: LAB[];
}

const indexCache = new WeakMap<LegoPalette, PaletteIndex>();

function indexFor(palette: LegoPalette): PaletteIndex {
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

export function nearestLegoColor(
  rgb: RGB,
  palette: LegoPalette,
  metric: ColorMetric = 'ciede2000',
): LegoColor {
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
  palette: LegoPalette,
  metric: ColorMetric = 'ciede2000',
): string {
  return nearestLegoColor(rgb, palette, metric).id;
}
