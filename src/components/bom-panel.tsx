'use client';

import { useMemo } from 'react';
import { buildBomEntries, type BomEntry } from '@/lib/bom';
import type { VoxelGridSnapshot } from '@/types/voxel.types';

export function BomPanel({ plan }: { plan: VoxelGridSnapshot | null }) {
  const entries = useMemo<BomEntry[]>(() => (plan ? buildBomEntries(plan) : []), [plan]);
  const total = entries.reduce((s, e) => s + e.count, 0);

  return (
    <aside className="border-t-2 border-ink bg-paper-2/40 lg:border-t-0 lg:border-l-2">
      <div className="space-y-4 p-6 md:p-7">
        <div className="flex items-baseline gap-3">
          <span className="display-xl text-[34px] text-red">04</span>
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
            <div className="flex items-baseline justify-between border-b-2 border-ink pb-2">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-2">
                Total
              </span>
              <span className="numeric text-[22px] font-bold leading-none text-red">
                {total.toLocaleString()}
                <span className="ml-1 font-mono text-[10px] text-ink-2">pcs</span>
              </span>
            </div>

            <ul className="-mx-1 max-h-[calc(100vh-300px)] space-y-1.5 overflow-y-auto pr-1">
              {entries.map((e) => (
                <li
                  key={e.key}
                  className="flex items-center gap-2 border-2 border-ink bg-paper px-2 py-1.5"
                >
                  <span
                    className="block h-6 w-6 shrink-0 border-2 border-ink"
                    style={{ background: e.colorHex }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-bold leading-tight text-ink">
                      {e.brickLabel}
                    </div>
                    <div className="truncate font-mono text-[9px] uppercase tracking-[0.12em] text-ink-2">
                      {e.colorName}
                      {e.bricklinkPartId && <span className="ml-1">· #{e.bricklinkPartId}</span>}
                    </div>
                  </div>
                  <span className="numeric shrink-0 text-[14px] font-bold leading-none text-ink">
                    ×{e.count}
                  </span>
                </li>
              ))}
            </ul>

            <div className="border-t border-dashed border-line-strong pt-2 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-2">
              {entries.length} unique part{entries.length === 1 ? '' : 's'}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
