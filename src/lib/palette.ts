import paletteFile from '../../data/lego-palette.json';
import type { LegoColor, LegoPalette, PaletteFile } from '@/types/palette.types';

const file = paletteFile as PaletteFile;

export const PALETTE_VERSION = file.version;
export const PALETTE: LegoPalette = file.colors;

const byId = new Map(PALETTE.map((c) => [c.id, c]));

export function getColor(id: string): LegoColor | undefined {
  return byId.get(id);
}

export function requireColor(id: string): LegoColor {
  const c = byId.get(id);
  if (!c) throw new Error(`unknown lego color id: ${id}`);
  return c;
}

export function paletteIds(): string[] {
  return PALETTE.map((c) => c.id);
}

export function availableColors(): LegoPalette {
  return PALETTE.filter((c) => c.available);
}
