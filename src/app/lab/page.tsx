'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LogoMark } from '@/components/logo-mark';
import { meshToVoxelGrid } from '@/lib/voxelizer/mesh-to-voxel';
import type { VoxelGridSnapshot } from '@/types/voxel.types';

const MeshViewer = dynamic(
  () => import('@/components/mesh-viewer').then((m) => m.MeshViewer),
  { ssr: false },
);

const VoxelPreview = dynamic(
  () => import('@/components/voxel-preview').then((m) => m.VoxelPreview),
  { ssr: false },
);

interface ModelOption {
  slug: string;
  label: string;
  cost: string;
  latency: string;
  inputs: string;
  notes: string;
}

const MODELS: ModelOption[] = [
  {
    slug: 'firtoz/trellis',
    label: 'Trellis (Microsoft, community port)',
    cost: '~$0.04',
    latency: '15-40s',
    inputs: '1 image (sent as images[])',
    notes: 'Cheapest, decent quality. Best ROI for our use case.',
  },
  {
    slug: 'tencent/hunyuan3d-2',
    label: 'Hunyuan3D-2 (Tencent, official)',
    cost: '~$0.11',
    latency: '60-120s',
    inputs: '1 image',
    notes: 'Higher quality textures, slower. Official Tencent.',
  },
  {
    slug: 'tencent/hunyuan-3d-3.1',
    label: 'Hunyuan3D-3.1 (newest)',
    cost: '~$0.15',
    latency: '~90s',
    inputs: '1 image (sent as images[])',
    notes: 'Newest Tencent release, sharper geometry.',
  },
  {
    slug: 'ndreca/hunyuan3d-2',
    label: 'Hunyuan3D-2 (ndreca, turbo)',
    cost: '~$0.11',
    latency: '~115s',
    inputs: '1 image',
    notes: 'Community-tuned turbo variant.',
  },
];

interface LabResult {
  ok: boolean;
  url?: string | null;
  referenceImageUrl?: string;
  referencePrompt?: string;
  dalleCostUsd?: number;
  dalleDurationMs?: number;
  rawOutput?: unknown;
  modelSlug?: string;
  versionId?: string;
  status?: string;
  durationMs: number;
  error?: string;
}

type SourceMode = 'text' | 'image';

export default function LabPage() {
  const [mode, setMode] = useState<SourceMode>('text');
  const [chosenSlug, setChosenSlug] = useState<string>(MODELS[0].slug);
  const [customSlug, setCustomSlug] = useState('');
  const [prompt, setPrompt] = useState('a cute red dragon');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileSelectedRef = useRef<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);
  const [voxelizing, setVoxelizing] = useState(false);
  const [voxelProgress, setVoxelProgress] = useState(0);
  const [voxelPlan, setVoxelPlan] = useState<VoxelGridSnapshot | null>(null);
  const [voxelizeError, setVoxelizeError] = useState<string | null>(null);
  const [showMode, setShowMode] = useState<'mesh' | 'bricks'>('mesh');
  const [resolution, setResolution] = useState(28);

  function onFile(file: File) {
    fileSelectedRef.current = file;
    setImageUrl(URL.createObjectURL(file));
  }

  async function generate() {
    const slug = customSlug.trim() || chosenSlug;
    if (!slug) return;
    if (mode === 'text' && !prompt.trim()) return;
    if (mode === 'image' && !fileSelectedRef.current) return;

    setBusy(true);
    setResult(null);
    setVoxelPlan(null);
    setVoxelizeError(null);
    setShowMode('mesh');
    try {
      const fd = new FormData();
      fd.set('slug', slug);
      fd.set('mode', mode);
      if (prompt.trim()) fd.set('prompt', prompt.trim());
      if (mode === 'image' && fileSelectedRef.current) {
        fd.set('image', fileSelectedRef.current);
      }

      const res = await fetch('/api/lab/generate-3d', { method: 'POST', body: fd });
      const data = (await res.json()) as LabResult;
      setResult(data);
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : 'request failed',
        durationMs: 0,
      });
    } finally {
      setBusy(false);
    }
  }

  async function voxelize() {
    if (!result?.url) return;
    setVoxelizing(true);
    setVoxelizeError(null);
    setVoxelProgress(0);
    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(result.url);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const plan = await meshToVoxelGrid(
        gltf.scene,
        { resolution, hollow: true, optimize: true },
        (pct) => setVoxelProgress(pct),
      );
      setVoxelPlan(plan);
      setShowMode('bricks');
    } catch (e) {
      setVoxelizeError(e instanceof Error ? e.message : 'voxelize failed');
    } finally {
      setVoxelizing(false);
      setVoxelProgress(0);
    }
  }

  return (
    <main className="grain min-h-dvh bg-paper">
      <header className="flex items-center justify-between border-b-2 border-ink bg-paper px-6 py-4 md:px-10">
        <div className="flex items-center gap-3">
          <LogoMark size={32} />
          <div>
            <div className="display-xl text-[20px]">BLOCKED · LAB</div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-2">
              AI 3D model testing bench
            </div>
          </div>
        </div>
        <a
          href="/studio"
          className="press inline-block bg-paper px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink"
        >
          ← Studio
        </a>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 p-6 md:p-10 lg:grid-cols-[400px_1fr]">
        <aside className="space-y-5">
          <section className="space-y-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-2">
              1 · Source
            </div>
            <div className="flex border-2 border-ink shadow-[3px_3px_0_var(--ink)]">
              <button
                type="button"
                onClick={() => setMode('text')}
                disabled={busy}
                className={`flex-1 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition ${
                  mode === 'text' ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-yellow'
                }`}
              >
                Text → 3D
              </button>
              <button
                type="button"
                onClick={() => setMode('image')}
                disabled={busy}
                className={`flex-1 border-l-2 border-ink px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] transition ${
                  mode === 'image' ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-yellow'
                }`}
              >
                Image → 3D
              </button>
            </div>
          </section>

          {mode === 'text' && (
            <section className="space-y-2">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-2">
                2 · Prompt
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                className="w-full resize-none border-2 border-ink bg-paper px-3 py-2 font-mono text-[13px] text-ink shadow-[3px_3px_0_var(--ink)] focus:bg-yellow focus:outline-none"
                placeholder="a cute red dragon"
                disabled={busy}
              />
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-2">
                Pipeline: text → DALL·E ($0.04) → 3D model → mesh
              </div>
            </section>
          )}

          {mode === 'image' && (
            <section className="space-y-2">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-2">
                2 · Image
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <div
                onClick={() => fileRef.current?.click()}
                className="press relative cursor-pointer overflow-hidden p-0"
                style={{ minHeight: 144 }}
              >
                {imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imageUrl}
                    alt="upload"
                    className="block h-[180px] w-full bg-ink object-contain"
                  />
                ) : (
                  <div className="flex h-full min-h-[144px] flex-col items-center justify-center px-4 py-6 text-center">
                    <div className="display-xl text-[16px]">DROP IMAGE</div>
                    <div className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink">
                      PNG · JPG · max 10MB · plain bg
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-2">
              3 · Model
            </div>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <label
                  key={m.slug}
                  className={`flex cursor-pointer items-start gap-3 border-2 border-ink bg-paper p-3 ${
                    chosenSlug === m.slug && !customSlug
                      ? 'shadow-[5px_5px_0_var(--ink)]'
                      : 'shadow-[3px_3px_0_var(--ink)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    checked={chosenSlug === m.slug && !customSlug}
                    onChange={() => {
                      setChosenSlug(m.slug);
                      setCustomSlug('');
                    }}
                    className="mt-0.5"
                    disabled={busy}
                  />
                  <div className="flex-1">
                    <div className="display-xl text-[13px] uppercase tracking-tight">
                      {m.label}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-[0.14em]">
                      <span className="font-bold text-red">{m.cost}</span>
                      <span className="text-ink-2">·</span>
                      <span className="text-ink-2">{m.latency}</span>
                      <span className="text-ink-2">·</span>
                      <span className="text-ink-2">in: {m.inputs}</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-ink-2">
                      {m.notes}
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-ink-2 opacity-70">
                      {m.slug}
                    </div>
                  </div>
                </label>
              ))}
              <input
                type="text"
                value={customSlug}
                onChange={(e) => setCustomSlug(e.target.value)}
                placeholder="custom slug → owner/model[:version]"
                className="w-full border-2 border-ink bg-paper px-3 py-2 font-mono text-[11px] text-ink shadow-[3px_3px_0_var(--ink)] focus:bg-yellow focus:outline-none"
                disabled={busy}
              />
            </div>
          </section>

          <button
            type="button"
            onClick={generate}
            disabled={busy}
            className="press w-full bg-red px-6 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-paper disabled:bg-ink-2"
          >
            {busy ? 'Generating · keep tab open' : 'Generate 3D mesh →'}
          </button>

          <details className="border-2 border-ink bg-paper p-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">
            <summary className="cursor-pointer font-bold">Test Hyper3D / Tripo separately</summary>
            <div className="mt-2 space-y-1 normal-case tracking-normal">
              <div>Hyper3D / Rodin: hyper3d.ai · ~$0.10-0.30/gen</div>
              <div>Tripo3D: tripo3d.ai · 600 free credits/mo</div>
              <div>Meshy: meshy.ai · 200 free credits/mo</div>
            </div>
          </details>
        </aside>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ink-2">
              Result
            </div>
            {result?.ok && result.url && (
              <div className="flex border-2 border-ink shadow-[3px_3px_0_var(--ink)]">
                <button
                  type="button"
                  onClick={() => setShowMode('mesh')}
                  className={`px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${
                    showMode === 'mesh' ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-yellow'
                  }`}
                >
                  Mesh
                </button>
                <button
                  type="button"
                  onClick={() => voxelPlan && setShowMode('bricks')}
                  disabled={!voxelPlan}
                  className={`border-l-2 border-ink px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${
                    showMode === 'bricks' ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-yellow'
                  } disabled:opacity-40`}
                >
                  Bricks {voxelPlan ? `· ${voxelPlan.voxels.length}` : ''}
                </button>
              </div>
            )}
          </div>
          <div className="aspect-square w-full overflow-hidden border-2 border-ink bg-paper-2/40">
            {result?.ok && result.url ? (
              showMode === 'bricks' && voxelPlan ? (
                <VoxelPreview plan={voxelPlan} />
              ) : (
                <MeshViewer url={result.url} />
              )
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center">
                {busy ? (
                  <div className="space-y-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2">
                    <div className="animate-pulse text-red font-bold">→ Calling Replicate</div>
                    <div>Polling every 2s — can take 15-180s</div>
                  </div>
                ) : result && !result.ok ? (
                  <div className="max-w-full space-y-1 break-words text-left font-mono text-[11px] text-red">
                    <div className="font-bold uppercase tracking-[0.14em]">Failed</div>
                    <div className="normal-case tracking-normal text-ink">{result.error}</div>
                    {result.modelSlug && (
                      <div className="mt-2 normal-case tracking-normal text-ink-2">
                        Model: {result.modelSlug}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2">
                    Upload an image, pick a model, generate
                  </div>
                )}
              </div>
            )}
          </div>

          {result?.ok && result.url && (
            <div className="space-y-2 border-2 border-ink bg-paper p-3 shadow-[3px_3px_0_var(--ink)]">
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-2">
                  → Convert mesh to Lego bricks
                </div>
                <div className="font-mono text-[10px] text-ink-2">
                  Resolution: <span className="font-bold text-red">{resolution}</span>
                </div>
              </div>
              <input
                type="range"
                min={16}
                max={36}
                step={1}
                value={resolution}
                onChange={(e) => setResolution(Number(e.target.value))}
                className="w-full"
                disabled={voxelizing}
              />
              {resolution >= 32 && (
                <div className="border-2 border-ink bg-yellow px-2 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-ink">
                  ⚠ {resolution >= 34 ? 'Heavy' : 'Slower'} — high-poly meshes may take 10-30s
                </div>
              )}
              <button
                type="button"
                onClick={voxelize}
                disabled={voxelizing}
                className="press w-full bg-red px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-paper disabled:bg-ink-2"
              >
                {voxelizing
                  ? `Voxelizing… ${Math.round(voxelProgress * 100)}%`
                  : 'Voxelize this mesh →'}
              </button>
              {voxelizing && (
                <div className="h-1 w-full border border-ink bg-paper">
                  <div
                    className="h-full bg-red transition-[width] duration-150"
                    style={{ width: `${Math.round(voxelProgress * 100)}%` }}
                  />
                </div>
              )}
              {voxelizeError && (
                <div className="font-mono text-[10px] text-red">{voxelizeError}</div>
              )}
              {voxelPlan && !voxelizing && (
                <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-2">
                  {voxelPlan.voxels.length} pieces · {voxelPlan.size.x}×{voxelPlan.size.y}×
                  {voxelPlan.size.z}
                </div>
              )}
            </div>
          )}

          {result?.ok && result.referenceImageUrl && (
            <div className="border-2 border-ink bg-paper p-3 shadow-[3px_3px_0_var(--ink)]">
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink-2">
                ↳ DALL·E reference (text→image step)
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.referenceImageUrl}
                alt={result.referencePrompt ?? 'dalle reference'}
                className="block w-full max-w-[180px] border-2 border-ink"
              />
            </div>
          )}

          {result?.ok && (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Total time" value={`${(result.durationMs / 1000).toFixed(1)}s`} />
              <Stat label="Status" value={result.status ?? '—'} />
              <Stat
                label="Total cost"
                value={`$${((result.dalleCostUsd ?? 0) + estimatedCostFor(result.modelSlug ?? '')).toFixed(2)}`}
              />
              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press col-span-3 bg-paper px-3 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink"
                >
                  Open mesh URL
                </a>
              )}
            </div>
          )}

          {result && (
            <details className="border-2 border-ink bg-paper p-3 font-mono text-[10px] text-ink-2">
              <summary className="cursor-pointer font-bold uppercase tracking-[0.14em]">
                Raw response
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[9px]">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          )}
        </section>
      </div>
    </main>
  );
}

function estimatedCostFor(slug: string): number {
  if (slug.includes('trellis')) return 0.04;
  if (slug.includes('hunyuan-3d-3.1')) return 0.15;
  if (slug.includes('hunyuan3d-2')) return 0.11;
  return 0.1;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-2 border-ink bg-paper p-2.5">
      <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-2">
        {label}
      </div>
      <div className="numeric mt-1 truncate text-[14px] font-bold leading-none text-ink">
        {value}
      </div>
    </div>
  );
}
