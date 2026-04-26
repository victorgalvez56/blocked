export type ColorCategory = 'core' | 'accent' | 'neutral' | 'skin';

export interface LegoColor {
  id: string;
  name: string;
  hex: string;
  rgb: [number, number, number];
  legoId: number | null;
  bricklinkId: number | null;
  available: boolean;
  category: ColorCategory;
}

export type LegoPalette = LegoColor[];

export interface PaletteFile {
  version: string;
  source: string;
  colors: LegoColor[];
}
