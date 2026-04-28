import paletteFile from '../../data/brick-palette.json';
import type { BrickColor, BrickPalette, PaletteFile } from '@/types/palette.types';

const file = paletteFile as PaletteFile;

export const PALETTE_VERSION = file.version;
export const PALETTE: BrickPalette = file.colors;

const byId = new Map(PALETTE.map((c) => [c.id, c]));

export function getColor(id: string): BrickColor | undefined {
  return byId.get(id);
}

export function requireColor(id: string): BrickColor {
  const c = byId.get(id);
  if (!c) throw new Error(`unknown brick color id: ${id}`);
  return c;
}

export function paletteIds(): string[] {
  return PALETTE.map((c) => c.id);
}

export function availableColors(): BrickPalette {
  return PALETTE.filter((c) => c.available);
}
