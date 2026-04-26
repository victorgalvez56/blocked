'use client';

import { useCallback, useRef, useState } from 'react';
import { VoxelPreview } from './voxel-preview';
import {
  DEFAULT_OPTS,
  loadImageElement,
  voxelizeImage,
  type ClientVoxelizeOpts,
  type DepthMode,
} from '@/lib/voxelizer/client-image-to-grid';
import type { VoxelGridSnapshot } from '@/types/voxel.types';

const DEPTH_MODES: Array<{ id: DepthMode; label: string }> = [
  { id: 'edge', label: 'Edge (rounded)' },
  { id: 'darkness', label: 'Darkness' },
  { id: 'brightness', label: 'Brightness' },
  { id: 'center', label: 'Center (dome)' },
  { id: 'flat', label: 'Flat' },
];

export function ImageRunner() {
  const [opts, setOpts] = useState<ClientVoxelizeOpts>(DEFAULT_OPTS);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [plan, setPlan] = useState<VoxelGridSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">blocked</h1>
        <p className="text-sm text-neutral-400">
          Upload an image. Get a 3D Lego-compatible voxel build, instantly.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-5">
          <section>
            <label className="block">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-neutral-700 bg-neutral-950 p-6 text-center transition hover:border-neutral-500 hover:bg-neutral-900"
              >
                {imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={imageUrl}
                    alt="upload"
                    className="max-h-32 rounded object-contain"
                  />
                ) : (
                  <>
                    <div className="text-sm font-semibold">Drop or click to upload</div>
                    <div className="mt-1 text-xs text-neutral-500">PNG / JPG, plain background works best</div>
                  </>
                )}
              </div>
            </label>
          </section>

          <section className="space-y-4">
            <SliderRow
              label="Resolution"
              value={opts.resolution}
              min={12}
              max={48}
              step={1}
              onChange={(v) => update('resolution', v)}
            />
            <SliderRow
              label="Max depth"
              value={opts.maxDepth}
              min={1}
              max={8}
              step={1}
              onChange={(v) => update('maxDepth', v)}
            />
            <SliderRow
              label="Background threshold"
              value={opts.backgroundThreshold}
              min={0}
              max={120}
              step={1}
              onChange={(v) => update('backgroundThreshold', v)}
            />

            <div className="space-y-1">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Depth mode</div>
              <select
                value={opts.depthMode}
                onChange={(e) => update('depthMode', e.target.value as DepthMode)}
                className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-white focus:outline-none"
              >
                {DEPTH_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={opts.mirror}
                onChange={(e) => update('mirror', e.target.checked)}
              />
              <span>Mirror to back (true 3D)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={opts.usePalette}
                onChange={(e) => update('usePalette', e.target.checked)}
              />
              <span>Snap to Lego palette</span>
            </label>
          </section>

          <section className="space-y-1 text-xs text-neutral-500">
            {plan && (
              <>
                <div>
                  {plan.voxels.length.toLocaleString()} voxels · {plan.size.x}×{plan.size.y}×{plan.size.z}
                </div>
                <div>{busy ? 'Voxelizing…' : 'Ready'}</div>
              </>
            )}
            {!plan && <div>Upload an image to begin.</div>}
          </section>
        </aside>

        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-neutral-500">3D preview</div>
          <div className="aspect-square w-full overflow-hidden rounded-lg border border-neutral-800 bg-black">
            {plan ? (
              <VoxelPreview plan={plan} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-neutral-600">
                Upload an image to see the 3D voxel build
              </div>
            )}
          </div>
          {error && (
            <div className="rounded-md border border-red-900 bg-red-950/30 p-3 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="uppercase tracking-wide text-neutral-500">{label}</span>
        <span className="font-mono text-neutral-300">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}
