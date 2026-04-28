import bricksFile from '../../data/bricks.json';
import type { BrickCatalog, BrickDef } from '@/types/brick.types';

const file = bricksFile as BrickCatalog;

export const BRICK_UNIT = file.unit;
export const BRICKS: BrickDef[] = file.pieces;

const byId = new Map(BRICKS.map((b) => [b.id, b]));

export function getBrick(id: string): BrickDef | undefined {
  return byId.get(id);
}

export function requireBrick(id: string): BrickDef {
  const b = byId.get(id);
  if (!b) throw new Error(`unknown brick id: ${id}`);
  return b;
}

export function defaultBrick(): BrickDef {
  return requireBrick('brick-1x1');
}

export const PHASE_1_BRICK_ID = 'brick-1x1';
