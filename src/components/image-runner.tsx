'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VoxelPreview, type Highlight, type PosterData } from './voxel-preview';
import { LogoMark } from './logo-mark';
import { BomPanel } from './bom-panel';
import {
  DEFAULT_OPTS,
  loadImageElement,
  type ClientVoxelizeOpts,
} from '@/lib/voxelizer/client-image-to-grid';
import { PALETTE } from '@/lib/palette';
import { voxelizeMultiview } from '@/lib/voxelizer/multiview';
import { voxelizeMultiviewN, VIEWS_8 } from '@/lib/voxelizer/multiview-n';
import { renderMeshTo4Views } from '@/lib/voxelizer/render-views';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';

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

type ViewKey = 'front' | 'side' | 'top';
const ALL_VIEW_KEYS: ViewKey[] = ['front', 'side', 'top'];

interface ImageEntry {
  el: HTMLImageElement;
  url: string;
  mimeType?: string;
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())} · ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())} UTC`;
}

export function ImageRunner() {
  const [opts, setOpts] = useState<ClientVoxelizeOpts>(DEFAULT_OPTS);
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
  const [highlight, setHighlight] = useState<Highlight>(null);
  const [exploded, setExploded] = useState(false);
  const [explode, setExplode] = useState(0);
  const [buildMode, setBuildMode] = useState(false);
  const [buildIndex, setBuildIndex] = useState(0);
  const [buildPlaying, setBuildPlaying] = useState(false);
  const [nukeMode, setNukeMode] = useState(false);
  const [nukeFlash, setNukeFlash] = useState(false);
  const [showMissile, setShowMissile] = useState(false);
  const [impactKey, setImpactKey] = useState(0);
  const [gravityActive, setGravityActive] = useState(false);
  const [gravityProgress, setGravityProgress] = useState(0);
  const [gravityOffsets, setGravityOffsets] = useState<Map<string, number> | null>(null);
  const [gravityRestoring, setGravityRestoring] = useState(false);
  const [disco, setDisco] = useState(false);
  const [blackholeProgress, setBlackholeProgress] = useState(0);
  const [recolorPreset, setRecolorPreset] = useState<string | null>(null);
  const [recolorMap, setRecolorMap] = useState<Map<string, string> | null>(null);
  const [photoMode, setPhotoMode] = useState(false);
  const [screenshotTrigger, setScreenshotTrigger] = useState(0);
  const [lotteryActive, setLotteryActive] = useState(false);
  const [lotteryRemovedKeys, setLotteryRemovedKeys] = useState<Set<string>>(new Set());
  const [lotteryPopVoxel, setLotteryPopVoxel] = useState<Voxel | null>(null);
  const [lotteryPopKey, setLotteryPopKey] = useState(0);
  const revealTweenRef = useRef<gsap.core.Tween | null>(null);
  const explodeTweenRef = useRef<gsap.core.Tween | null>(null);
  const nukeTweenRef = useRef<gsap.core.Tween | null>(null);
  const nukeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravityTweenRef = useRef<gsap.core.Tween | null>(null);
  const blackholeTweenRef = useRef<gsap.core.Tween | null>(null);
  const blackholeProgressRef = useRef(0);
  const lotteryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lotteryRemainingRef = useRef<string[]>([]);

  useEffect(() => {
    setStamp(nowStamp());
    const id = setInterval(() => setStamp(nowStamp()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    explodeTweenRef.current?.kill();
    const obj = { v: explode };
    explodeTweenRef.current = gsap.to(obj, {
      v: exploded ? 1 : 0,
      duration: exploded ? 1.1 : 0.9,
      ease: exploded ? 'power3.out' : 'power2.inOut',
      onUpdate: () => setExplode(obj.v),
    });
    return () => {
      explodeTweenRef.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exploded]);

  useEffect(() => {
    if (!plan) return;
    if (nukeTimeoutRef.current) clearTimeout(nukeTimeoutRef.current);
    nukeTweenRef.current?.kill();
    gravityTweenRef.current?.kill();
    setNukeMode(false);
    setShowMissile(false);
    setNukeFlash(false);
    setGravityActive(false);
    setGravityProgress(0);
    setGravityOffsets(null);
    setGravityRestoring(false);
    setDisco(false);
    blackholeTweenRef.current?.kill();
    blackholeProgressRef.current = 0;
    setBlackholeProgress(0);
    setRecolorPreset(null);
    setRecolorMap(null);
    setPhotoMode(false);
    if (lotteryIntervalRef.current) { clearInterval(lotteryIntervalRef.current); lotteryIntervalRef.current = null; }
    setLotteryActive(false);
    setLotteryRemovedKeys(new Set());
    setLotteryPopVoxel(null);
    setExploded(false);
    setExplode(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

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

  const orderedVoxels = useMemo(() => {
    if (!plan) return [];
    return [...plan.voxels].sort((a, b) => {
      if (a.coord[1] !== b.coord[1]) return a.coord[1] - b.coord[1];
      if (a.coord[2] !== b.coord[2]) return a.coord[2] - b.coord[2];
      return a.coord[0] - b.coord[0];
    });
  }, [plan]);

  useEffect(() => {
    if (buildMode) {
      revealTweenRef.current?.kill();
      setBuildIndex(0);
      setBuildPlaying(true);
    } else {
      setBuildPlaying(false);
    }
  }, [buildMode]);

  useEffect(() => {
    if (!buildMode || !buildPlaying) return;
    const total = orderedVoxels.length;
    if (total === 0) return;
    // 2× default speed — halved budget vs the natural pace
    const stepMs = Math.max(15, Math.min(60, Math.round(4000 / total)));
    const id = setInterval(() => {
      setBuildIndex((i) => {
        if (i >= total) {
          setBuildPlaying(false);
          return total;
        }
        return i + 1;
      });
    }, stepMs);
    return () => clearInterval(id);
  }, [buildMode, buildPlaying, orderedVoxels.length]);

  const currentVoxel = useMemo(() => {
    if (!buildMode || buildIndex === 0) return null;
    return orderedVoxels[buildIndex - 1] ?? null;
  }, [buildMode, buildIndex, orderedVoxels]);

  const slicedPlan = useMemo<VoxelGridSnapshot | null>(() => {
    if (!plan) return null;
    if (buildMode) {
      return { ...plan, voxels: orderedVoxels.slice(0, buildIndex) };
    }
    if (layerCap >= plan.size.y - 1) return plan;
    return {
      ...plan,
      voxels: plan.voxels.filter((v) => v.coord[1] <= layerCap),
    };
  }, [plan, layerCap, buildMode, buildIndex, orderedVoxels]);

  // Re-voxelize whenever inputs or opts change. Front is required; side/top
  // are optional and refine the depth when present.
  useEffect(() => {
    if (!views.front) return;
    setBusy(true);
    setError(null);

    const handle = requestAnimationFrame(() => {
      try {
        const next = voxelizeMultiview(
          {
            front: views.front!.el,
            side: views.side?.el ?? null,
            top: views.top?.el ?? null,
          },
          opts,
        );
        setPlan(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'voxelize failed');
      } finally {
        setBusy(false);
      }
    });

    return () => cancelAnimationFrame(handle);
  }, [views, opts]);

  async function loadExample() {
    try {
      const url = '/example/dragon.png';
      const img = await loadImageFromUrl(url);
      setViews((prev) => ({ ...prev, front: { el: img, url } }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'example failed');
    }
  }

  async function loadView(key: ViewKey, file: File) {
    try {
      const img = await loadImageElement(file);
      setViews((prev) => ({ ...prev, [key]: { el: img, url: img.src, mimeType: file.type } }));
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
      setViews((prev) => ({ ...prev, front: { el: img, url: data.url! } }));
      setOpts((prev) => ({ ...prev, density: Math.max(prev.density, 70) }));
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
        urls?: Record<string, string>;
        error?: string;
      };
      if (!data.ok || !data.urls) {
        throw new Error(data.error ?? 'DALL·E batch failed');
      }
      const loaded = await Promise.all(
        ALL_VIEW_KEYS.map(async (k) => {
          const img = await loadImageFromUrl(data.urls![k]);
          return [k, { el: img, url: data.urls![k] }] as const;
        }),
      );
      setViews(Object.fromEntries(loaded) as Record<ViewKey, ImageEntry>);
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

      // Step 4: stuff the views into state — voxelizer takes over
      const next: Partial<Record<ViewKey, ImageEntry>> = {};
      for (const k of ALL_VIEW_KEYS) {
        next[k] = { el: rendered[k].image, url: rendered[k].dataUrl };
      }
      setViews(next as Record<ViewKey, ImageEntry>);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'max-detail generation failed');
    } finally {
      setAiBusy(false);
    }
  }

  function triggerNuke() {
    if (!plan || buildMode) return;
    if (nukeTimeoutRef.current) clearTimeout(nukeTimeoutRef.current);
    nukeTweenRef.current?.kill();
    explodeTweenRef.current?.kill();
    setExploded(false);
    setNukeMode(false);
    setShowMissile(false);
    setNukeFlash(false);
    setExplode(0);

    setShowMissile(true);

    nukeTimeoutRef.current = setTimeout(() => {
      setShowMissile(false);
      setNukeFlash(true);
      setNukeMode(true);
      setImpactKey((k) => k + 1);
      const obj = { v: 0 };
      nukeTweenRef.current = gsap.to(obj, {
        v: 4,
        duration: 0.45,
        ease: 'power4.out',
        onUpdate: () => setExplode(obj.v),
      });
      setTimeout(() => setNukeFlash(false), 400);
    }, 1100);
  }

  function computeGravityOffsets(voxels: Voxel[]): Map<string, number> {
    const columns = new Map<string, number[]>();
    for (const v of voxels) {
      const col = `${v.coord[0]},${v.coord[2]}`;
      let arr = columns.get(col);
      if (!arr) { arr = []; columns.set(col, arr); }
      arr.push(v.coord[1]);
    }
    for (const arr of columns.values()) arr.sort((a, b) => a - b);
    const offsets = new Map<string, number>();
    for (const v of voxels) {
      const col = columns.get(`${v.coord[0]},${v.coord[2]}`)!;
      const rank = col.indexOf(v.coord[1]);
      offsets.set(`${v.coord[0]},${v.coord[1]},${v.coord[2]}`, rank - v.coord[1]);
    }
    return offsets;
  }

  function triggerGravity() {
    if (!plan) return;
    gravityTweenRef.current?.kill();
    if (gravityActive) {
      // Spring back to original — simple ease-out, no bounce
      setGravityRestoring(true);
      const obj = { v: gravityProgress };
      gravityTweenRef.current = gsap.to(obj, {
        v: 0,
        duration: 0.65,
        ease: 'power3.out',
        onUpdate: () => setGravityProgress(obj.v),
        onComplete: () => {
          setGravityActive(false);
          setGravityOffsets(null);
          setGravityRestoring(false);
        },
      });
    } else {
      // Collapse with bounce physics — longer duration lets bounces breathe
      const offsets = computeGravityOffsets(plan.voxels);
      setGravityOffsets(offsets);
      setGravityActive(true);
      setGravityRestoring(false);
      const obj = { v: 0 };
      gravityTweenRef.current = gsap.to(obj, {
        v: 1,
        duration: 1.8,
        ease: 'none',
        onUpdate: () => setGravityProgress(obj.v),
      });
    }
  }

  // ── Black hole ──────────────────────────────────────────────────────────────

  function triggerBlackhole() {
    if (!plan || buildMode) return;
    blackholeTweenRef.current?.kill();
    const cur = blackholeProgressRef.current;
    const obj = { v: cur };
    if (cur < 0.5) {
      blackholeTweenRef.current = gsap.to(obj, {
        v: 1, duration: 1.6, ease: 'power2.in',
        onUpdate: () => { blackholeProgressRef.current = obj.v; setBlackholeProgress(obj.v); },
      });
    } else {
      blackholeTweenRef.current = gsap.to(obj, {
        v: 0, duration: 1.4, ease: 'power3.out',
        onUpdate: () => { blackholeProgressRef.current = obj.v; setBlackholeProgress(obj.v); },
      });
    }
  }

  // ── Palette roulette ────────────────────────────────────────────────────────

  const PRESETS: Record<string, string[]> = {
    fire:   ['bright-light-yellow','yellow','orange','dark-orange','red','dark-red','dark-brown'],
    ocean:  ['white','light-bluish-gray','lavender','sand-blue','medium-blue','blue','dark-blue'],
    matrix: ['bright-light-yellow','lime','bright-green','green','dark-green','black'],
    candy:  ['white','bright-light-yellow','coral','pink','dark-pink','magenta','purple'],
  };
  const PRESET_ORDER = ['fire', 'ocean', 'matrix', 'candy'];

  function hexLum(hex: string): number {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  function buildRecolorMap(voxels: Voxel[], preset: string | null): Map<string, string> | null {
    if (!preset) return null;
    const uniqueIds = [...new Set(voxels.map((v) => v.colorId))];
    const paletteLookup = Object.fromEntries(
      PALETTE.map((c) => [c.id, c.hex]),
    );
    const sorted = [...uniqueIds].sort(
      (a, b) => hexLum(paletteLookup[a] ?? 'ffffff') - hexLum(paletteLookup[b] ?? 'ffffff'),
    );
    let themeIds: string[];
    if (preset === 'random') {
      themeIds = PALETTE.map((c) => c.id);
    } else {
      themeIds = [...(PRESETS[preset] ?? [])].sort(
        (a, b) => hexLum(paletteLookup[a] ?? 'ffffff') - hexLum(paletteLookup[b] ?? 'ffffff'),
      );
    }
    const map = new Map<string, string>();
    sorted.forEach((id, i) => {
      if (preset === 'random') {
        map.set(id, themeIds[Math.floor(Math.random() * themeIds.length)]);
      } else {
        map.set(id, themeIds[i % themeIds.length]);
      }
    });
    return map;
  }

  function cycleRecolor() {
    if (!plan) return;
    const next = recolorPreset === null
      ? PRESET_ORDER[0]
      : recolorPreset === PRESET_ORDER[PRESET_ORDER.length - 1]
        ? null
        : PRESET_ORDER[PRESET_ORDER.indexOf(recolorPreset) + 1];
    setRecolorPreset(next);
    setRecolorMap(buildRecolorMap(plan.voxels, next));
  }

  // ── Lottery ─────────────────────────────────────────────────────────────────

  function startLottery() {
    if (!plan) return;
    lotteryRemainingRef.current = plan.voxels.map(
      (v) => `${v.coord[0]},${v.coord[1]},${v.coord[2]}`,
    );
    setLotteryActive(true);
    setLotteryRemovedKeys(new Set());
    lotteryIntervalRef.current = setInterval(() => {
      const arr = lotteryRemainingRef.current;
      if (arr.length === 0) {
        clearInterval(lotteryIntervalRef.current!);
        lotteryIntervalRef.current = null;
        setLotteryActive(false);
        return;
      }
      const idx = Math.floor(Math.random() * arr.length);
      const key = arr[idx];
      arr[idx] = arr[arr.length - 1];
      arr.pop();
      const [x, y, z] = key.split(',').map(Number);
      const voxel = plan.voxels.find(
        (v) => v.coord[0] === x && v.coord[1] === y && v.coord[2] === z,
      ) ?? null;
      setLotteryPopVoxel(voxel);
      setLotteryPopKey((k) => k + 1);
      setLotteryRemovedKeys((prev) => { const s = new Set(prev); s.add(key); return s; });
    }, 180);
  }

  function resetLottery() {
    if (lotteryIntervalRef.current) { clearInterval(lotteryIntervalRef.current); lotteryIntervalRef.current = null; }
    setLotteryActive(false);
    setLotteryRemovedKeys(new Set());
    setLotteryPopVoxel(null);
  }

  // ── Generic opt update ──────────────────────────────────────────────────────

  function update<K extends keyof ClientVoxelizeOpts>(key: K, value: ClientVoxelizeOpts[K]) {
    setOpts((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="grain flex h-dvh flex-col overflow-hidden">
      {/* HEADER */}
      <header className="relative z-10 flex shrink-0 items-center justify-between border-b-2 border-ink bg-paper px-6 py-4 md:px-8">
        <div className="flex items-center gap-4">
          <LogoMark size={36} />
          <div>
            <div className="display-xl text-[26px]">BLOCKED</div>
            <div className="eyebrow mt-0.5">Image → 3D Voxel · Brick Edition</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/victorgalvez56/blocked"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            className="flex items-center justify-center border-2 border-ink bg-paper p-1.5 text-ink shadow-[2px_2px_0_var(--ink)] transition-colors hover:bg-ink hover:text-paper"
          >
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 0C5.373 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.562 21.8 24 17.302 24 12 24 5.373 18.627 0 12 0z" />
            </svg>
          </a>
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
      <main className="relative grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[320px_1fr_300px]">
        {/* SIDEBAR — controls */}
        <aside className="overflow-y-auto border-b-2 border-ink bg-paper-2/40 lg:border-b-0 lg:border-r-2">
          <div className="space-y-4 p-5 md:p-6">
            <SectionHeader
              index="01"
              title="Source"
              subtitle="Front drives shape · side & top refine depth"
            />

            <DropZone
              imageUrl={views.front?.url ?? null}
              imageMimeType={views.front?.mimeType ?? null}
              onFile={(f) => loadView('front', f)}
            />

            {!views.front && (
              <button
                type="button"
                onClick={loadExample}
                className="press w-full bg-yellow px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink"
              >
                ✦ Try the example specimen
              </button>
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
                {aiError && (
                  <div className="border-2 border-red bg-red/5 px-2 py-1 font-mono text-[10px] text-ink">
                    <span className="font-bold uppercase tracking-[0.14em] text-red">Error</span>{' '}
                    <span>{aiError}</span>
                  </div>
                )}
              </div>
            )}

            {views8 && (
              <div className="space-y-2 border-t-2 border-ink pt-3">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-red">
                  ◉ 8 views (gpt-image-1)
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

            <Divider />

            <SectionHeader
              index="02"
              title="Geometry"
              subtitle={views.front ? 'Tune the build' : 'Locked — load an image first'}
            />

            <fieldset
              disabled={!views.front}
              aria-disabled={!views.front}
              className="space-y-4 disabled:pointer-events-none disabled:opacity-40"
            >
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
                label="Density"
                suffix="%"
                value={opts.density}
                min={5}
                max={100}
                step={1}
                onChange={(v) => update('density', v)}
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

              <div className="space-y-3 pt-1">
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
            </fieldset>

            {error && (
              <div className="border-2 border-red bg-red/5 p-3 font-mono text-[11px] text-red">
                <div className="font-bold tracking-[0.1em]">ERROR</div>
                <div className="mt-1">{error}</div>
              </div>
            )}

            {plan && (
              <>
                <Divider />
                <SectionHeader index="03" title="FX" subtitle="Modes & effects" />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBuildMode((b) => !b)}
                    aria-pressed={buildMode}
                    className={`press py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${
                      buildMode ? 'bg-red text-paper hover:bg-red hover:text-paper' : 'bg-paper text-ink'
                    }`}
                  >
                    {buildMode ? '⨉ Exit build' : '▷ Build mode'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (nukeMode) {
                        nukeTweenRef.current?.kill();
                        setNukeMode(false);
                        const obj = { v: explode };
                        explodeTweenRef.current = gsap.to(obj, {
                          v: 0, duration: 0.9, ease: 'power2.inOut',
                          onUpdate: () => setExplode(obj.v),
                        });
                      } else {
                        setExploded((x) => !x);
                      }
                    }}
                    aria-pressed={exploded || nukeMode}
                    disabled={buildMode}
                    className={`press py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] disabled:opacity-40 ${
                      exploded || nukeMode ? 'bg-red text-paper hover:bg-red hover:text-paper' : 'bg-paper text-ink'
                    }`}
                  >
                    {exploded || nukeMode ? '⊙ Reassemble' : '✦ Explode'}
                  </button>
                  <button
                    type="button"
                    onClick={triggerGravity}
                    disabled={buildMode || showMissile || nukeMode}
                    className={`press py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] disabled:opacity-40 ${
                      gravityActive ? 'bg-red text-paper hover:bg-red hover:text-paper' : 'bg-paper text-ink'
                    }`}
                  >
                    {gravityActive ? '▲ Restore' : '▼ Gravity'}
                  </button>
                  <button
                    type="button"
                    onClick={triggerNuke}
                    disabled={buildMode || showMissile}
                    className={`press py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] disabled:opacity-40 ${
                      nukeMode || showMissile ? 'bg-red text-paper hover:bg-red hover:text-paper' : 'bg-paper text-ink'
                    }`}
                  >
                    {showMissile ? '☢ …' : '☢ Nuke'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisco((d) => !d)}
                    disabled={buildMode}
                    aria-pressed={disco}
                    className={`press py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] disabled:opacity-40 ${
                      disco ? 'bg-yellow text-ink hover:bg-yellow hover:text-ink' : 'bg-paper text-ink'
                    }`}
                  >
                    ★ Disco
                  </button>
                  <button
                    type="button"
                    onClick={triggerBlackhole}
                    disabled={buildMode}
                    className={`press py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] disabled:opacity-40 ${
                      blackholeProgress > 0.05 ? 'bg-ink text-paper hover:bg-ink hover:text-paper' : 'bg-paper text-ink'
                    }`}
                  >
                    {blackholeProgress > 0.95 ? '◎ Emerge' : blackholeProgress > 0.05 ? '◯ …' : '◯ Black hole'}
                  </button>
                  <button
                    type="button"
                    onClick={cycleRecolor}
                    disabled={buildMode}
                    className={`press py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] disabled:opacity-40 ${
                      recolorPreset ? 'bg-blue text-paper hover:bg-blue hover:text-paper' : 'bg-paper text-ink'
                    }`}
                  >
                    {recolorPreset ? `⬡ ${recolorPreset}` : '⬡ Recolor'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoMode((p) => !p)}
                    disabled={buildMode}
                    aria-pressed={photoMode}
                    className={`press py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] disabled:opacity-40 ${
                      photoMode ? 'bg-green text-paper hover:bg-green hover:text-paper' : 'bg-paper text-ink'
                    }`}
                  >
                    {photoMode ? '⬜ Exit photo' : '⬜ Photo'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (lotteryActive) {
                      if (lotteryIntervalRef.current) { clearInterval(lotteryIntervalRef.current); lotteryIntervalRef.current = null; }
                      setLotteryActive(false);
                    } else if (lotteryRemovedKeys.size > 0) {
                      resetLottery();
                    } else {
                      startLottery();
                    }
                  }}
                  disabled={buildMode}
                  className={`press w-full py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] disabled:opacity-40 ${
                    lotteryActive
                      ? 'bg-red text-paper hover:bg-red hover:text-paper'
                      : lotteryRemovedKeys.size > 0
                        ? 'bg-yellow text-ink hover:bg-yellow hover:text-ink'
                        : 'bg-paper text-ink'
                  }`}
                >
                  {lotteryActive
                    ? `■ Stop — ${plan.voxels.length - lotteryRemovedKeys.size} left`
                    : lotteryRemovedKeys.size > 0
                      ? `↺ Restore all ${plan.voxels.length} pcs`
                      : '✂ Lottery'}
                </button>
              </>
            )}
          </div>
        </aside>

        {/* VIEWER */}
        <section className="relative flex min-h-0 flex-col overflow-hidden bg-paper">
          <div className="relative flex-1 overflow-hidden p-6 md:p-10">
            <div className="relative h-full w-full">
              <span className="viewfinder-corner tl" />
              <span className="viewfinder-corner tr" />
              <span className="viewfinder-corner bl" />
              <span className="viewfinder-corner br" />

              <div className="absolute -top-5 left-0 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-2">
                Fig. 01 — Specimen
              </div>
              <div className="absolute -top-5 right-0 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-2">
                {plan
                  ? `${plan.size.x}×${plan.size.y}×${plan.size.z} units`
                  : 'awaiting input'}
              </div>

              {false && plan && (
                <div className="absolute right-3 top-3 z-10 flex flex-wrap justify-end gap-2" style={{ maxWidth: '560px' }}>
                  <button
                    type="button"
                    onClick={() => setBuildMode((b) => !b)}
                    aria-pressed={buildMode}
                    className={`press px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${
                      buildMode
                        ? 'bg-red text-paper hover:bg-red hover:text-paper'
                        : 'bg-paper text-ink'
                    }`}
                  >
                    {buildMode ? '⨉ Exit build' : '▷ Build mode'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (nukeMode) {
                        nukeTweenRef.current?.kill();
                        setNukeMode(false);
                        const obj = { v: explode };
                        explodeTweenRef.current = gsap.to(obj, {
                          v: 0,
                          duration: 0.9,
                          ease: 'power2.inOut',
                          onUpdate: () => setExplode(obj.v),
                        });
                      } else {
                        setExploded((x) => !x);
                      }
                    }}
                    aria-pressed={exploded || nukeMode}
                    disabled={buildMode}
                    className={`press px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 ${
                      exploded || nukeMode
                        ? 'bg-red text-paper hover:bg-red hover:text-paper'
                        : 'bg-paper text-ink'
                    }`}
                  >
                    {exploded || nukeMode ? '⊙ Reassemble' : '✦ Explode'}
                  </button>
                  <button
                    type="button"
                    onClick={triggerGravity}
                    disabled={buildMode || showMissile || nukeMode}
                    className={`press px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 ${
                      gravityActive
                        ? 'bg-red text-paper hover:bg-red hover:text-paper'
                        : 'bg-paper text-ink'
                    }`}
                  >
                    {gravityActive ? '▲ Restore' : '▼ Gravity'}
                  </button>
                  <button
                    type="button"
                    onClick={triggerNuke}
                    disabled={buildMode || showMissile}
                    className={`press px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 ${
                      nukeMode || showMissile
                        ? 'bg-red text-paper hover:bg-red hover:text-paper'
                        : 'bg-paper text-ink'
                    }`}
                  >
                    {showMissile ? '☢ …' : '☢ Nuke'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisco((d) => !d)}
                    disabled={buildMode}
                    aria-pressed={disco}
                    className={`press px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 ${
                      disco
                        ? 'bg-yellow text-ink hover:bg-yellow hover:text-ink'
                        : 'bg-paper text-ink'
                    }`}
                  >
                    ★ Disco
                  </button>
                  <button
                    type="button"
                    onClick={triggerBlackhole}
                    disabled={buildMode}
                    className={`press px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 ${
                      blackholeProgress > 0.05
                        ? 'bg-ink text-paper hover:bg-ink hover:text-paper'
                        : 'bg-paper text-ink'
                    }`}
                  >
                    {blackholeProgress > 0.95 ? '◎ Emerge' : blackholeProgress > 0.05 ? '◯ …' : '◯ Black hole'}
                  </button>
                  <button
                    type="button"
                    onClick={cycleRecolor}
                    disabled={buildMode}
                    className={`press px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 ${
                      recolorPreset
                        ? 'bg-blue text-paper hover:bg-blue hover:text-paper'
                        : 'bg-paper text-ink'
                    }`}
                  >
                    {recolorPreset ? `⬡ ${recolorPreset}` : '⬡ Recolor'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoMode((p) => !p)}
                    disabled={buildMode}
                    aria-pressed={photoMode}
                    className={`press px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 ${
                      photoMode
                        ? 'bg-green text-paper hover:bg-green hover:text-paper'
                        : 'bg-paper text-ink'
                    }`}
                  >
                    ⬜ Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (lotteryActive) {
                        if (lotteryIntervalRef.current) { clearInterval(lotteryIntervalRef.current); lotteryIntervalRef.current = null; }
                        setLotteryActive(false);
                      } else if (lotteryRemovedKeys.size > 0) {
                        resetLottery();
                      } else {
                        startLottery();
                      }
                    }}
                    disabled={buildMode}
                    className={`press px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-40 ${
                      lotteryActive
                        ? 'bg-red text-paper hover:bg-red hover:text-paper'
                        : lotteryRemovedKeys.size > 0
                          ? 'bg-yellow text-ink hover:bg-yellow hover:text-ink'
                          : 'bg-paper text-ink'
                    }`}
                  >
                    {lotteryActive ? '■ Stop' : lotteryRemovedKeys.size > 0 ? `↺ Restore (${(plan?.voxels.length ?? 0) - lotteryRemovedKeys.size})` : '✂ Lottery'}
                  </button>
                </div>
              )}

              <div className="h-full w-full overflow-hidden">
                {slicedPlan ? (
                  <VoxelPreview
                    plan={slicedPlan}
                    highlight={highlight}
                    explode={explode}
                    currentVoxel={currentVoxel}
                    nuke={nukeMode}
                    missileActive={showMissile}
                    impactKey={impactKey}
                    gravityOffsets={gravityOffsets ?? undefined}
                    gravityProgress={gravityProgress}
                    gravityRestoring={gravityRestoring}
                    disco={disco}
                    blackholeProgress={blackholeProgress}
                    hiddenKeys={lotteryRemovedKeys.size > 0 ? lotteryRemovedKeys : undefined}
                    lotteryPopVoxel={lotteryPopVoxel}
                    lotteryPopKey={lotteryPopKey}
                    recolorMap={recolorMap ?? undefined}
                    photoMode={photoMode}
                    screenshotTrigger={screenshotTrigger}
                    posterData={photoMode && slicedPlan ? ({
                      sizeX: slicedPlan.size.x,
                      sizeY: slicedPlan.size.y,
                      sizeZ: slicedPlan.size.z,
                      pieceCount: slicedPlan.voxels.length,
                      stamp,
                    } satisfies PosterData) : null}
                  />
                ) : (
                  <EmptyState />
                )}
              </div>

              {photoMode && slicedPlan && (
                <>
                  <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="display-xl text-[48px] leading-none text-ink">BLOCKED</div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-ink-2">
                          {slicedPlan.size.x} × {slicedPlan.size.y} × {slicedPlan.size.z} units
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="numeric text-[42px] font-bold leading-none text-red">
                          {slicedPlan.voxels.length.toLocaleString()}
                        </div>
                        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">pieces</div>
                      </div>
                    </div>
                    <div className="flex items-end justify-between">
                      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-2">{stamp}</div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-ink-2">blocked.victorgalvez.dev</div>
                    </div>
                  </div>
                  <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
                    <button
                      type="button"
                      onClick={() => setScreenshotTrigger((t) => t + 1)}
                      className="press bg-ink px-5 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-paper hover:bg-ink"
                    >
                      ⬇ Save PNG
                    </button>
                  </div>
                </>
              )}

              {nukeFlash && (
                <div className="nuke-flash pointer-events-none absolute inset-0 z-20 bg-white" />
              )}
            </div>
          </div>

          {plan && buildMode && (
            <div className="flex shrink-0 items-center gap-3 border-t-2 border-ink bg-paper px-4 py-2.5">
              <button
                type="button"
                onClick={() => setBuildIndex((i) => Math.max(0, i - 1))}
                disabled={buildIndex <= 0}
                className="press bg-paper px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink disabled:opacity-30"
                aria-label="Previous piece"
              >
                ◀
              </button>
              <button
                type="button"
                onClick={() => {
                  if (buildIndex >= orderedVoxels.length) {
                    setBuildIndex(0);
                    setBuildPlaying(true);
                  } else {
                    setBuildPlaying((p) => !p);
                  }
                }}
                className="press bg-red px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-paper hover:bg-red hover:text-paper"
              >
                {buildIndex >= orderedVoxels.length
                  ? '↻ Replay'
                  : buildPlaying
                    ? '❚❚ Pause'
                    : '▶ Play'}
              </button>
              <button
                type="button"
                onClick={() =>
                  setBuildIndex((i) => Math.min(orderedVoxels.length, i + 1))
                }
                disabled={buildIndex >= orderedVoxels.length}
                className="press bg-paper px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink disabled:opacity-30"
                aria-label="Next piece"
              >
                ▶
              </button>
              <input
                type="range"
                min={0}
                max={orderedVoxels.length}
                value={buildIndex}
                onChange={(e) => {
                  setBuildPlaying(false);
                  setBuildIndex(Number(e.target.value));
                }}
                className="flex-1"
              />
              <span className="numeric shrink-0 text-[14px] font-bold leading-none text-red">
                {buildIndex}
                <span className="ml-1 font-mono text-[10px] text-ink-2">
                  / {orderedVoxels.length}
                </span>
              </span>
              {currentVoxel && (
                <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2 md:inline">
                  layer {currentVoxel.coord[1] + 1}
                </span>
              )}
            </div>
          )}

          {plan && !buildMode && plan.size.y > 1 && (
            <div className="flex shrink-0 items-center gap-3 border-t-2 border-ink bg-paper px-4 py-2.5">
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
        </section>

        {/* BOM column */}
        <BomPanel plan={plan} onHighlight={setHighlight} />
      </main>
    </div>
  );
}

function DropZone({
  imageUrl,
  imageMimeType,
  onFile,
}: {
  imageUrl: string | null;
  imageMimeType: string | null;
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
          className={`block max-h-[180px] w-full object-contain ${imageMimeType !== 'image/png' ? 'bg-ink' : ''}`}
          style={
            imageMimeType === 'image/png'
              ? {
                  backgroundImage:
                    'linear-gradient(45deg,#ccc 25%,transparent 25%),' +
                    'linear-gradient(-45deg,#ccc 25%,transparent 25%),' +
                    'linear-gradient(45deg,transparent 75%,#ccc 75%),' +
                    'linear-gradient(-45deg,transparent 75%,#ccc 75%)',
                  backgroundSize: '12px 12px',
                  backgroundPosition: '0 0,0 6px,6px -6px,-6px 0',
                  backgroundColor: '#fff',
                }
              : undefined
          }
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
