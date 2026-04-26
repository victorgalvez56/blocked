export interface BrickDef {
  id: string;
  type: 'brick' | 'plate';
  dimensions: { studsX: number; studsZ: number; plateHeight: number };
  bricklinkPartId: string | null;
  legoDesignId: string | null;
  category: 'core' | 'optional';
}

export type BrickId = BrickDef['id'];

export interface BrickCatalog {
  version: string;
  source: string;
  unit: {
    studMm: number;
    plateHeightMm: number;
    brickHeightMm: number;
    comment: string;
  };
  pieces: BrickDef[];
}
