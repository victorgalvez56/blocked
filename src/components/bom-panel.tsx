'use client';

import { useMemo } from 'react';
import { buildBomEntries, type BomEntry } from '@/lib/bom';
import { buildBricklinkXml, buildPlainCsv } from '@/lib/exporters/bricklink-xml';
import { buildObjModel } from '@/lib/exporters/obj-3d';
import { BrickIcon } from './brick-icon';
import type { VoxelGridSnapshot } from '@/types/voxel.types';
import type { Highlight } from './voxel-preview';

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface BrickGroup {
  brickId: string;
  brickLabel: string;
  bricklinkPartId: string | null;
  totalCount: number;
  totalArea: number;
  colorEntries: BomEntry[];
}

function groupByBrick(entries: BomEntry[]): BrickGroup[] {
  const m = new Map<string, BrickGroup>();
  for (const e of entries) {
    const g = m.get(e.brickId);
    if (g) {
      g.colorEntries.push(e);
      g.totalCount += e.count;
    } else {
      m.set(e.brickId, {
        brickId: e.brickId,
        brickLabel: e.brickLabel,
        bricklinkPartId: e.bricklinkPartId,
        totalCount: e.count,
        totalArea: e.area,
        colorEntries: [e],
      });
    }
  }
  const arr = Array.from(m.values());
  for (const g of arr) g.colorEntries.sort((a, b) => b.count - a.count);
  arr.sort((a, b) => {
    if (b.totalArea !== a.totalArea) return b.totalArea - a.totalArea;
    return b.totalCount - a.totalCount;
  });
  return arr;
}

export function BomPanel({
  plan,
  onHighlight,
}: {
  plan: VoxelGridSnapshot | null;
  onHighlight?: (h: Highlight) => void;
}) {
  const entries = useMemo<BomEntry[]>(() => (plan ? buildBomEntries(plan) : []), [plan]);
  const groups = useMemo<BrickGroup[]>(() => groupByBrick(entries), [entries]);
  const total = entries.reduce((s, e) => s + e.count, 0);

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-t-2 border-ink bg-paper-2/40 lg:border-t-0 lg:border-l-2">
      <div className="flex h-full min-h-0 flex-col gap-3 p-5 md:p-6">
        <div className="flex shrink-0 items-baseline gap-3">
          <span className="display-xl text-[34px] text-red">03</span>
          <div className="flex-1">
            <div className="display-xl text-[16px] uppercase tracking-tight text-ink">
              Pieces
            </div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink">
              Bill of materials
            </div>
          </div>
        </div>

        {!plan && (
          <div className="border-2 border-dashed border-line-strong/50 p-4 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-2">
            — no specimen loaded —
          </div>
        )}

        {plan && (
          <>
            <div className="flex shrink-0 items-baseline justify-between border-b-2 border-ink pb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-2">
                Total
              </span>
              <span className="numeric text-[22px] font-bold leading-none text-red">
                {total.toLocaleString()}
                <span className="ml-1 font-mono text-[10px] text-ink-2">pcs</span>
              </span>
            </div>

            <ul className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {groups.map((g) => (
                <li
                  key={g.brickId}
                  className="border-2 border-ink bg-paper transition-colors hover:bg-yellow/30"
                  onMouseEnter={() => onHighlight?.({ brickId: g.brickId })}
                  onMouseLeave={() => onHighlight?.(null)}
                >
                  <header className="flex items-center gap-3 border-b-2 border-ink bg-paper-2/60 px-3 py-2">
                    <BrickIcon brickId={g.brickId} color="#e8dfcb" size={42} />
                    <div className="min-w-0 flex-1">
                      <div className="display-xl truncate text-[14px] uppercase tracking-tight text-ink">
                        {g.brickLabel}
                      </div>
                      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-2">
                        {g.colorEntries.length} color{g.colorEntries.length === 1 ? '' : 's'}
                        {g.bricklinkPartId && (
                          <span className="ml-1.5">· #{g.bricklinkPartId}</span>
                        )}
                      </div>
                    </div>
                    <div className="numeric shrink-0 text-right">
                      <div className="text-[18px] font-bold leading-none text-red">
                        {g.totalCount}
                      </div>
                      <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-ink-2">
                        pcs
                      </div>
                    </div>
                  </header>

                  <ul className="divide-y divide-line">
                    {g.colorEntries.map((c) => (
                      <li
                        key={c.key}
                        className="flex items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-yellow/50"
                        onMouseEnter={() =>
                          onHighlight?.({ brickId: c.brickId, colorId: c.colorId })
                        }
                        onMouseLeave={() => onHighlight?.({ brickId: g.brickId })}
                      >
                        <BrickIcon brickId={c.brickId} color={c.colorHex} size={32} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-bold leading-tight text-ink">
                            {c.colorName}
                          </div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-2">
                            #{c.colorHex.replace('#', '').toUpperCase()}
                          </div>
                        </div>
                        <span className="numeric shrink-0 text-[13px] font-bold leading-none text-ink">
                          ×{c.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <div className="shrink-0 border-t border-dashed border-line-strong pt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-2">
              {groups.length} unique size{groups.length === 1 ? '' : 's'} ·{' '}
              {entries.length} unique part{entries.length === 1 ? '' : 's'}
            </div>

            <div className="shrink-0 space-y-2">
              <div className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-ink-2">
                Export
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const r = buildBricklinkXml(plan);
                    downloadBlob(r.xml, 'blocked-build.bsx', 'application/xml');
                  }}
                  className="press flex-1 bg-paper px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink"
                >
                  BrickLink XML
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const csv = buildPlainCsv(plan);
                    downloadBlob(csv, 'blocked-build.csv', 'text/csv');
                  }}
                  className="press bg-paper px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink"
                >
                  CSV
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  const { obj, mtl } = buildObjModel(plan);
                  downloadBlob(obj, 'blocked-build.obj', 'text/plain');
                  downloadBlob(mtl, 'blocked-build.mtl', 'text/plain');
                }}
                className="press w-full bg-paper px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink"
              >
                OBJ + MTL (3D)
              </button>
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-2">
                Paste .bsx into BrickLink Wanted List · Import .obj into Blender
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
