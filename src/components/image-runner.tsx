'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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
import { voxelizeMultiview } from '@/lib/voxelizer/multiview';
import { voxelizeMultiviewN, VIEWS_8 } from '@/lib/voxelizer/multiview-n';
import { renderMeshTo4Views } from '@/lib/voxelizer/render-views';
import type { VoxelGridSnapshot } from '@/types/voxel.types';

// Hide AI-generation entry points (DALL·E / gpt-image-1 / Trellis) without removing
// the code paths. Flip to true to re-expose the buttons.
const SHOW_AI_GENERATE = false;

async function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('failed to load remote image'));
    img.src = url;
  });
  return img;
}

type SourceMode = 'single' | 'multiview';
type ViewKey = 'front' | 'side' | 'back' | 'top';
const VIEW_KEYS: ViewKey[] = ['front', 'side', 'back', 'top'];
const VIEW_LABELS: Record<ViewKey, string> = {
  front: 'Front',
  side: 'Side',
  back: 'Back',
  top: 'Top',
};
const VIEW_HINTS: Record<ViewKey, string> = {
  front: 'Subject facing camera',
  side: 'Right profile · front faces left',
  back: 'Subject from behind',
  top: 'View from above · front at bottom',
};

interface ImageEntry {
  el: HTMLImageElement;
  url: string;
}

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
  const [mode, setMode] = useState<SourceMode>('single');
  const [single, setSingle] = useState<ImageEntry | null>(null);
  const [views, setViews] = useState<Partial<Record<ViewKey, ImageEntry>>>({});
  const [plan, setPlan] = useState<VoxelGridSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState('—');
  const [layerCap, setLayerCap] = useState<number>(99);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [views8, setViews8] = useState<Array<{ key: string; url: string }> | null>(null);
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

  // Re-voxelize whenever inputs or opts change
  useEffect(() => {
    const ready =
      mode === 'single'
        ? single != null
        : !!(views.front && views.side && views.back && views.top);
    if (!ready) return;

    setBusy(true);
    setError(null);

    const handle = requestAnimationFrame(() => {
      try {
        let next: VoxelGridSnapshot;
        if (mode === 'single' && single) {
          next = voxelizeImage(single.el, opts);
        } else if (
          mode === 'multiview' &&
          views.front &&
          views.side &&
          views.back &&
          views.top
        ) {
          next = voxelizeMultiview(
            {
              front: views.front.el,
              side: views.side.el,
              back: views.back.el,
              top: views.top.el,
            },
            opts,
          );
        } else {
          return;
        }
        setPlan(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'voxelize failed');
      } finally {
        setBusy(false);
      }
    });

    return () => cancelAnimationFrame(handle);
  }, [mode, single, views, opts]);

  async function loadSingle(file: File) {
    try {
      const img = await loadImageElement(file);
      setSingle({ el: img, url: img.src });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'image load failed');
    }
  }

  async function loadView(key: ViewKey, file: File) {
    try {
      const img = await loadImageElement(file);
      setViews((prev) => ({ ...prev, [key]: { el: img, url: img.src } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'image load failed');
    }
  }

  async function generateFromText() {
    if (aiPrompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch('/api/dalle-image', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (!data.ok || !data.url) {
        throw new Error(data.error ?? 'DALL·E failed');
      }
      const img = await loadImageFromUrl(data.url);
      setSingle({ el: img, url: data.url });
      setMode('single');
      setOpts((prev) => ({
        ...prev,
        maxDepth: Math.max(prev.maxDepth, 16),
        mirror: true,
      }));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'generation failed');
    } finally {
      setAiBusy(false);
    }
  }

  async function generate4Views() {
    if (aiPrompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch('/api/dalle-views', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        urls?: Record<ViewKey, string>;
        error?: string;
      };
      if (!data.ok || !data.urls) {
        throw new Error(data.error ?? 'DALL·E batch failed');
      }
      const loaded = await Promise.all(
        VIEW_KEYS.map(async (k) => {
          const img = await loadImageFromUrl(data.urls![k]);
          return [k, { el: img, url: data.urls![k] }] as const;
        }),
      );
      setViews(Object.fromEntries(loaded) as Record<ViewKey, ImageEntry>);
      setMode('multiview');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'generation failed');
    } finally {
      setAiBusy(false);
    }
  }

  async function generate8Views() {
    if (aiPrompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch('/api/dalle-views-8', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        urls?: Record<string, string>;
        error?: string;
      };
      if (!data.ok || !data.urls) {
        throw new Error(data.error ?? 'gpt-image-1 8-view batch failed');
      }

      const order = ['front', 'fr', 'right', 'br', 'back', 'bl', 'left', 'fl'] as const;
      const loadedImages: HTMLImageElement[] = await Promise.all(
        order.map((k) => loadImageFromUrl(data.urls![k])),
      );

      // Display all 8 thumbs in the 8-view panel
      setViews8(order.map((key) => ({ key, url: data.urls![key] })));

      // Clear the 4-slot UI so it doesn't auto-trigger the 4-view voxelizer
      setViews({});

      // Run the N-view voxelizer directly — uses ALL 8
      const plan = voxelizeMultiviewN(
        loadedImages.map((image, i) => ({ image, spec: VIEWS_8[i] })),
        opts,
      );
      setPlan(plan);
      setMode('multiview');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'generation failed');
    } finally {
      setAiBusy(false);
    }
  }

  async function generateMaxDetail() {
    if (aiPrompt.trim().length < 3) return;
    setAiBusy(true);
    setAiError(null);
    try {
      // Step 1: chain DALL·E → Trellis to get a GLB. /api/lab/generate-3d already does this in 'text' mode
      const res = await fetch('/api/lab/generate-3d', {
        method: 'POST',
        body: (() => {
          const fd = new FormData();
          fd.set('slug', 'firtoz/trellis');
          fd.set('mode', 'text');
          fd.set('prompt', aiPrompt.trim());
          return fd;
        })(),
      });
      const data = (await res.json()) as { ok: boolean; url?: string | null; error?: string };
      if (!data.ok || !data.url) {
        throw new Error(data.error ?? 'AI 3D mesh generation failed');
      }

      // Step 2: load the mesh client-side
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(data.url);

      // Step 3: render 4 ortho views from the mesh — guaranteed identity consistency
      const rendered = await renderMeshTo4Views(gltf.scene, 512);

      // Step 4: stuff the views into multiview state — existing voxelizer takes over
      const next: Partial<Record<ViewKey, ImageEntry>> = {};
      for (const k of VIEW_KEYS) {
        next[k] = { el: rendered[k].image, url: rendered[k].dataUrl };
      }
      setViews(next as Record<ViewKey, ImageEntry>);
      setMode('multiview');
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'max-detail generation failed');
    } finally {
      setAiBusy(false);
    }
  }

  function update<K extends keyof ClientVoxelizeOpts>(key: K, value: ClientVoxelizeOpts[K]) {
    setOpts((prev) => ({ ...prev, [key]: value }));
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
            <SectionHeader
              index="01"
              title="Source"
              subtitle={mode === 'single' ? '1 image · bas-relief' : '4 images · true 3D'}
            />

            <ModeSwitch mode={mode} onChange={setMode} />

            {mode === 'single' && (
              <>
                <DropZone
                  imageUrl={single?.url ?? null}
                  onFile={loadSingle}
                />

                {SHOW_AI_GENERATE && (
                  <div className="space-y-2 border-2 border-dashed border-line-strong p-3">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-2">
                      ↳ or generate with AI
                    </div>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={2}
                      placeholder="a cute red dragon"
                      className="w-full resize-none border-2 border-ink bg-paper px-2.5 py-1.5 font-mono text-[12px] text-ink shadow-[3px_3px_0_var(--ink)] focus:bg-yellow focus:outline-none"
                      disabled={aiBusy}
                      maxLength={300}
                    />
                    <button
                      type="button"
                      onClick={generateFromText}
                      disabled={aiBusy || aiPrompt.trim().length < 3}
                      className="press w-full bg-paper px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink disabled:opacity-50"
                    >
                      {aiBusy ? 'DALL·E…' : '1 image — bas-relief · $0.04'}
                    </button>
                    <button
                      type="button"
                      onClick={generate4Views}
                      disabled={aiBusy || aiPrompt.trim().length < 3}
                      className="press w-full bg-red px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-paper disabled:bg-ink-2"
                    >
                      {aiBusy ? 'DALL·E ×4…' : '4 views — true 3D · $0.16'}
                    </button>
                    {aiError && (
                      <div className="border-2 border-red bg-red/5 px-2 py-1 font-mono text-[10px] text-ink">
                        <span className="font-bold uppercase tracking-[0.14em] text-red">Error</span>{' '}
                        <span>{aiError}</span>
                      </div>
                    )}
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-2">
                      4 views = front/side/back/top → silhouette intersection
                    </div>
                  </div>
                )}
              </>
            )}

            {mode === 'multiview' && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {VIEW_KEYS.map((k) => (
                    <ViewSlot
                      key={k}
                      viewKey={k}
                      entry={views[k] ?? null}
                      onFile={(f) => loadView(k, f)}
                    />
                  ))}
                </div>
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-2">
                  {Object.keys(views).length} / 4 views uploaded
                </div>

                {views8 && (
                  <div className="space-y-2 border-t-2 border-ink pt-3">
                    <div className="flex items-baseline justify-between">
                      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-red">
                        ◉ 8 views (gpt-image-1)
                      </div>
                      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-ink-2">
                        all used in silhouette intersection
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {views8.map((v) => (
                        <div
                          key={v.key}
                          className="relative overflow-hidden border-2 border-ink shadow-[2px_2px_0_var(--ink)]"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={v.url}
                            alt={v.key}
                            className="block h-14 w-full bg-ink object-contain"
                          />
                          <div className="absolute left-0 top-0 bg-ink px-1 py-0.5 font-mono text-[7px] font-bold uppercase tracking-[0.18em] text-paper">
                            {v.key}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {SHOW_AI_GENERATE && (
                  <div className="space-y-2 border-2 border-dashed border-line-strong p-3">
                    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-2">
                      ↳ or generate with AI
                    </div>
                    <textarea
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={2}
                      placeholder="a cute red dragon"
                      className="w-full resize-none border-2 border-ink bg-paper px-2.5 py-1.5 font-mono text-[12px] text-ink shadow-[3px_3px_0_var(--ink)] focus:bg-yellow focus:outline-none"
                      disabled={aiBusy}
                      maxLength={300}
                    />
                    <button
                      type="button"
                      onClick={generateMaxDetail}
                      disabled={aiBusy || aiPrompt.trim().length < 3}
                      className="press w-full bg-red px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-paper hover:bg-red hover:text-paper disabled:bg-ink-2"
                    >
                      {aiBusy ? 'DALL·E → Trellis → render… (~30-60s)' : '🏆 Max detail · text → AI 3D · $0.08'}
                    </button>
                    <button
                      type="button"
                      onClick={generate8Views}
                      disabled={aiBusy || aiPrompt.trim().length < 3}
                      className="press w-full bg-paper px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink disabled:opacity-50"
                    >
                      {aiBusy ? '…' : 'gpt-image-1 · 8 views · $0.34'}
                    </button>
                    <button
                      type="button"
                      onClick={generate4Views}
                      disabled={aiBusy || aiPrompt.trim().length < 3}
                      className="press w-full bg-paper px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink disabled:opacity-50"
                    >
                      {aiBusy ? '…' : 'gpt-image-1 · 4 views · $0.17'}
                    </button>
                    <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-2">
                      🏆 = AI 3D mesh + render local · perfect consistency
                    </div>
                    {aiError && (
                      <div className="border-2 border-red bg-red/5 px-2 py-1 font-mono text-[10px] text-ink">
                        <span className="font-bold uppercase tracking-[0.14em] text-red">Error</span>{' '}
                        <span>{aiError}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

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
              max={24}
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
              {mode === 'single' && (
                <ToggleRow
                  label="Mirror to back"
                  hint="True 3D extrusion"
                  checked={opts.mirror}
                  onChange={(v) => update('mirror', v)}
                />
              )}
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
              <ToggleRow
                label="Hollow interior"
                hint="Skip pieces no one will ever see"
                checked={opts.hollow}
                onChange={(v) => update('hollow', v)}
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

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: SourceMode;
  onChange: (m: SourceMode) => void;
}) {
  return (
    <div className="flex border-2 border-ink shadow-[3px_3px_0_var(--ink)]">
      <button
        type="button"
        onClick={() => onChange('single')}
        className={`flex-1 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition ${
          mode === 'single'
            ? 'bg-ink text-paper'
            : 'bg-paper text-ink hover:bg-yellow'
        }`}
      >
        Single view
      </button>
      <button
        type="button"
        onClick={() => onChange('multiview')}
        className={`flex-1 border-l-2 border-ink px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition ${
          mode === 'multiview'
            ? 'bg-ink text-paper'
            : 'bg-paper text-ink hover:bg-yellow'
        }`}
      >
        Multi-view 3D
      </button>
    </div>
  );
}

function DropZone({
  imageUrl,
  onFile,
}: {
  imageUrl: string | null;
  onFile: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={dragRef}
      onDragOver={(e) => {
        e.preventDefault();
        dragRef.current?.setAttribute('data-dragging', 'true');
      }}
      onDragLeave={() => dragRef.current?.removeAttribute('data-dragging')}
      onDrop={(e) => {
        e.preventDefault();
        dragRef.current?.removeAttribute('data-dragging');
        const f = e.dataTransfer.files?.[0];
        if (f && f.type.startsWith('image/')) onFile(f);
      }}
      onClick={() => fileInputRef.current?.click()}
      className="press relative cursor-pointer overflow-hidden p-0 data-[dragging=true]:bg-yellow"
      style={{ minHeight: 144 }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="source"
          className="block max-h-[180px] w-full bg-ink object-contain"
        />
      ) : (
        <div className="flex h-full min-h-[144px] flex-col items-center justify-center gap-2 px-4 py-6 text-center">
          <div className="display-xl text-[18px]">DROP IMAGE</div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink">
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
  );
}

function ViewSlot({
  viewKey,
  entry,
  onFile,
}: {
  viewKey: ViewKey;
  entry: ImageEntry | null;
  onFile: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={dragRef}
      onDragOver={(e) => {
        e.preventDefault();
        dragRef.current?.setAttribute('data-dragging', 'true');
      }}
      onDragLeave={() => dragRef.current?.removeAttribute('data-dragging')}
      onDrop={(e) => {
        e.preventDefault();
        dragRef.current?.removeAttribute('data-dragging');
        const f = e.dataTransfer.files?.[0];
        if (f && f.type.startsWith('image/')) onFile(f);
      }}
      onClick={() => fileInputRef.current?.click()}
      className="press relative cursor-pointer overflow-hidden p-0 data-[dragging=true]:bg-yellow"
      style={{ minHeight: 110 }}
    >
      {entry ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={entry.url}
            alt={viewKey}
            className="block h-[110px] w-full bg-ink object-contain"
          />
          <div className="absolute left-1 top-1 bg-ink px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.18em] text-paper">
            {VIEW_LABELS[viewKey]}
          </div>
        </>
      ) : (
        <div className="flex h-full min-h-[110px] flex-col items-center justify-center gap-1 px-2 text-center">
          <div className="display-xl text-[14px] tracking-tight">
            {VIEW_LABELS[viewKey].toUpperCase()}
          </div>
          <div className="font-mono text-[8px] font-semibold uppercase leading-tight tracking-[0.14em] text-ink-2">
            {VIEW_HINTS[viewKey]}
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
