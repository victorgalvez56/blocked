import { buildBomEntries } from '@/lib/bom';
import type { VoxelGridSnapshot } from '@/types/voxel.types';

export interface BricklinkExportResult {
  xml: string;
  itemCount: number;
  totalPieces: number;
  skippedNoPartId: number;
  skippedNoColorId: number;
}

export function buildBricklinkXml(snapshot: VoxelGridSnapshot): BricklinkExportResult {
  const entries = buildBomEntries(snapshot);
  let skippedNoPartId = 0;
  let skippedNoColorId = 0;
  const items: string[] = [];
  let itemCount = 0;
  let totalPieces = 0;

  for (const e of entries) {
    if (!e.bricklinkPartId) {
      skippedNoPartId++;
      continue;
    }
    if (e.bricklinkColorId == null) {
      skippedNoColorId++;
      continue;
    }
    items.push(
      `  <ITEM>
    <ITEMTYPE>P</ITEMTYPE>
    <ITEMID>${e.bricklinkPartId}</ITEMID>
    <COLOR>${e.bricklinkColorId}</COLOR>
    <MINQTY>${e.count}</MINQTY>
  </ITEM>`,
    );
    itemCount++;
    totalPieces += e.count;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<INVENTORY>\n${items.join('\n')}\n</INVENTORY>\n`;
  return { xml, itemCount, totalPieces, skippedNoPartId, skippedNoColorId };
}

export function buildPlainCsv(snapshot: VoxelGridSnapshot): string {
  const entries = buildBomEntries(snapshot);
  const rows = [
    ['BrickLabel', 'Color', 'Count', 'BrickLinkPartID', 'BrickLinkColorID', 'HexColor'].join(','),
  ];
  for (const e of entries) {
    rows.push(
      [
        `"${e.brickLabel}"`,
        `"${e.colorName}"`,
        e.count,
        e.bricklinkPartId ?? '',
        e.bricklinkColorId ?? '',
        e.colorHex,
      ].join(','),
    );
  }
  return rows.join('\n') + '\n';
}
