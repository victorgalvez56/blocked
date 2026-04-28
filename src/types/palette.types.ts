export type ColorCategory = 'core' | 'accent' | 'neutral' | 'skin';

export interface BrickColor {
  id: string;
  name: string;
  hex: string;
  rgb: [number, number, number];
  paletteId: number | null;
  bricklinkId: number | null;
  available: boolean;
  category: ColorCategory;
}

export type BrickPalette = BrickColor[];

export interface PaletteFile {
  version: string;
  source: string;
  colors: BrickColor[];
}
