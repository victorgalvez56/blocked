import type { BrickId } from './brick.types';

export interface BomLine {
  brickId: BrickId;
  colorId: string;
  count: number;
  bricklinkPartId: string | null;
  bricklinkColorId: number | null;
}

export interface Bom {
  lines: BomLine[];
  totalPieces: number;
  totalUniqueParts: number;
}
