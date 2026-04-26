'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { VoxelPreview } from './voxel-preview';
import { LogoMark } from './logo-mark';
import { BomPanel } from './bom-panel';
import {
  DEFAULT_OPTS,
  loadImageElement,
  voxelizeImage,
  type ClientVoxelizeOpts,
  type DepthMode,
} from '@/lib/voxelizer/client-image-to-grid';
import type { VoxelGridSnapshot } from '@/types/voxel.types';

const DEPTH_MODES: Array<{ id: DepthMode; label: string }> = [
  { id: 'edge', label: 'Edge — rounded' },
  { id: 'darkness', label: 'Darkness' },
  { id: 'brightness', label: 'Brightness' },
  { id: 'center', label: 'Center — dome' },
  { id: 'flat', label: 'Flat slab' },
];

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} · ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;
}

export function ImageRunner() {
  const [opts, setOpts] = useState<ClientVoxelizeOpts>(DEFAULT_OPTS);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [plan, setPlan] = useState<VoxelGridSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState('—');
  const [layerCap, setLayerCap] = useState<number>(99);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  const revealTweenRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    setStamp(nowStamp());
    const id = setInterval(() => setStamp(nowStamp()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!plan) return;
    revealTweenRef.current?.kill();
    revealTweenRef.current = null;

    const target = plan.size.y - 1;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target <= 0) {
      setLayerCap(target);
      return;
    }

    setLayerCap(0);
    const obj = { v: 0 };
    let lastCap = -1;
    revealTweenRef.current = gsap.to(obj, {
      v: target,
      duration: Math.min(0.55 + target * 0.075, 1.6),
      ease: 'power1.out',
      onUpdate: () => {
        const c = Math.floor(obj.v);
        if (c !== lastCap) {
          lastCap = c;
          setLayerCap(c);
        }
      },
      onComplete: () => {
        setLayerCap(target);
      },
    });

    return () => {
      revealTweenRef.current?.kill();
    };
  }, [plan]);

  const slicedPlan = useMemo<VoxelGridSnapshot | null>(() => {
    if (!plan) return null;
    if (layerCap >= plan.size.y - 1) return plan;
    return {
      ...plan,
      voxels: plan.voxels.filter((v) => v.coord[1] <= layerCap),
    };
  }, [plan, layerCap]);

  const runVoxelize = useCallback(async (img: HTMLImageElement, o: ClientVoxelizeOpts) => {
    setBusy(true);
    setError(null);
    try {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const grid = voxelizeImage(img, o);
      setPlan(grid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'voxelize failed');
    } finally {
      setBusy(false);
    }
  }, []);

  async function onFile(file: File) {
    try {
      const img = await loadImageElement(file);
      setImageEl(img);
      setImageUrl(img.src);
      runVoxelize(img, opts);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'image load failed');
    }
  }

  function update<K extends keyof ClientVoxelizeOpts>(key: K, value: ClientVoxelizeOpts[K]) {
    const next = { ...opts, [key]: value };
    setOpts(next);
    if (imageEl) runVoxelize(imageEl, next);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragRef.current?.removeAttribute('data-dragging');
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) onFile(f);
  }

  return (
    <div className="grain min-h-dvh">
      {/* HEADER */}
      <header className="relative z-10 flex items-center justify-between border-b-2 border-ink bg-paper px-6 py-4 md:px-8">
        <div className="flex items-center gap-4">
          <LogoMark size={36} />
          <div>
            <div className="display-xl text-[26px]">BLOCKED</div>
            <div className="eyebrow mt-0.5">Image → 3D Voxel · Lego Edition</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 md:flex">
            <span className="live-dot block h-2.5 w-2.5 bg-red" />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-2">
              Live render
            </span>
          </div>
          <div className="bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-paper">
            {stamp}
          </div>
        </div>
      </header>

      {/* MAIN GRID */}
      <main className="relative grid grid-cols-1 lg:grid-cols-[340px_1fr_300px]">
        {/* SIDEBAR — controls */}
        <aside className="border-b-2 border-ink bg-paper-2/40 lg:border-b-0 lg:border-r-2">
          <div className="p-6 md:p-7 space-y-6">
            <SectionHeader index="01" title="Source" subtitle="Drop or pick an image" />

            <div
              ref={dragRef}
              onDragOver={(e) => {
                e.preventDefault();
                dragRef.current?.setAttribute('data-dragging', 'true');
              }}
              onDragLeave={() => dragRef.current?.removeAttribute('data-dragging')}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="press relative cursor-pointer overflow-hidden p-0 data-[dragging=true]:bg-yellow"
              style={{ minHeight: 144 }}
            >
              {imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={imageUrl}
                  alt="source"
                  className="block max-h-[180px] w-full object-contain bg-ink"
                />
              ) : (
                <div className="flex h-full min-h-[144px] flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                  <div className="display-xl text-[18px]">DROP IMAGE HERE</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2">
                    PNG · JPG · plain bg works best
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
            </div>

            <Divider />

            <SectionHeader index="02" title="Geometry" subtitle="Tune the build" />

            <SliderRow
              label="Resolution"
              suffix="px"
              value={opts.resolution}
              min={12}
              max={48}
              step={1}
              onChange={(v) => update('resolution', v)}
            />
            <SliderRow
              label="Max depth"
              suffix=""
              value={opts.maxDepth}
              min={1}
              max={8}
              step={1}
              onChange={(v) => update('maxDepth', v)}
            />
            <SliderRow
              label="Background cut"
              suffix=""
              value={opts.backgroundThreshold}
              min={0}
              max={120}
              step={1}
              onChange={(v) => update('backgroundThreshold', v)}
            />

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">Depth mode</span>
              </div>
              <select
                value={opts.depthMode}
                onChange={(e) => update('depthMode', e.target.value as DepthMode)}
              >
                {DEPTH_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-3 pt-1">
              <ToggleRow
                label="Mirror to back"
                hint="True 3D extrusion"
                checked={opts.mirror}
                onChange={(v) => update('mirror', v)}
              />
              <ToggleRow
                label="Snap to Lego palette"
                hint="34 official colors"
                checked={opts.usePalette}
                onChange={(v) => update('usePalette', v)}
              />
              <ToggleRow
                label="Optimize bricks"
                hint="Combine 1×1s into 1×2, 2×4, etc"
                checked={opts.optimize}
                onChange={(v) => update('optimize', v)}
              />
            </div>

            <Divider />

            <SectionHeader index="03" title="Read-out" subtitle="Live build stats" />

            <Readout plan={plan} busy={busy} />

            {error && (
              <div className="border-2 border-red bg-red/5 p-3 font-mono text-[11px] text-red">
                <div className="font-bold tracking-[0.1em]">ERROR</div>
                <div className="mt-1">{error}</div>
              </div>
            )}
          </div>
        </aside>

        {/* VIEWER */}
        <section className="relative bg-paper">
          <div className="relative h-[640px] w-full lg:h-[calc(100vh-77px)]">
            <div className="absolute inset-6 md:inset-10">
              <div className="relative h-full w-full">
                <span className="viewfinder-corner tl" />
                <span className="viewfinder-corner tr" />
                <span className="viewfinder-corner bl" />
                <span className="viewfinder-corner br" />

                <div className="absolute -top-7 left-0 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-2">
                  Fig. 01 — Specimen
                </div>
                <div className="absolute -top-7 right-0 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-2">
                  {plan
                    ? `${plan.size.x}×${plan.size.y}×${plan.size.z} units`
                    : 'awaiting input'}
                </div>

                <div className="h-full w-full overflow-hidden">
                  {slicedPlan ? <VoxelPreview plan={slicedPlan} /> : <EmptyState />}
                </div>

                {plan && plan.size.y > 1 && (
                  <div className="absolute -bottom-16 left-0 right-0 flex items-center gap-3 border-2 border-ink bg-paper px-4 py-2.5 shadow-[4px_4px_0_var(--ink)]">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink">
                      Slice ↕
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={plan.size.y - 1}
                      value={Math.min(layerCap, plan.size.y - 1)}
                      onChange={(e) => {
                        revealTweenRef.current?.kill();
                        setLayerCap(Number(e.target.value));
                      }}
                      className="flex-1"
                    />
                    <span className="numeric shrink-0 text-[14px] font-bold leading-none text-red">
                      {Math.min(layerCap, plan.size.y - 1) + 1}
                      <span className="ml-1 font-mono text-[10px] text-ink-2">
                        / {plan.size.y}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        revealTweenRef.current?.kill();
                        setLayerCap(plan.size.y - 1);
                      }}
                      disabled={layerCap >= plan.size.y - 1}
                      className="press bg-paper px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-ink"
                    >
                      All
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* BOM column */}
        <BomPanel plan={plan} />
      </main>
    </div>
  );
}

function SectionHeader({
  index,
  title,
  subtitle,
}: {
  index: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="display-xl text-[34px] text-red">{index}</span>
      <div className="flex-1">
        <div className="display-xl text-[16px] uppercase tracking-tight">{title}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-2">
          {subtitle}
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-dashed border-line-strong" />;
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">{label}</span>
        <span className="numeric text-[14px] font-semibold text-red">
          {value}
          <span className="ml-0.5 text-[10px] text-ink-2">{suffix}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between font-mono text-[9px] tracking-[0.1em] text-ink-2/70">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="flex-1 -translate-y-0.5">
        <div className="text-[13px] font-semibold leading-tight">{label}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2">
          {hint}
        </div>
      </div>
    </label>
  );
}

function Readout({
  plan,
  busy,
}: {
  plan: VoxelGridSnapshot | null;
  busy: boolean;
}) {
  if (!plan) {
    return (
      <div className="border-2 border-dashed border-line-strong/50 p-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">
        — no specimen loaded —
      </div>
    );
  }
  const colors = new Set(plan.voxels.map((v) => v.colorId));
  const sizes = new Set(plan.voxels.map((v) => v.brickId));
  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat label="Pieces" value={plan.voxels.length.toLocaleString()} accent />
      <Stat label="Sizes" value={sizes.size.toString()} />
      <Stat label="Colors" value={colors.size.toString()} />
      <Stat label="Width" value={`${plan.size.x}`} />
      <Stat label="Height" value={`${plan.size.y}`} />
      <Stat label="Status" value={busy ? 'BUILDING' : 'READY'} />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="border-2 border-ink bg-paper p-2.5">
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-2">{label}</div>
      <div
        className={`numeric mt-1 text-[20px] font-semibold leading-none ${
          accent ? 'text-red' : 'text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-paper">
      <div className="grid grid-cols-3 gap-1.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="h-9 w-9 border-2 border-ink"
            style={{
              background:
                i === 4
                  ? 'var(--red)'
                  : i % 3 === 0
                    ? 'var(--paper)'
                    : 'var(--paper-2)',
              boxShadow: '3px 3px 0 var(--ink)',
              animationDelay: `${i * 60}ms`,
            }}
          />
        ))}
      </div>
      <div className="text-center">
        <div className="display-xl text-[22px]">DROP AN IMAGE</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-2">
          to assemble its 3D brick form
        </div>
      </div>
    </div>
  );
}
