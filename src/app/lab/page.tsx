'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { LogoMark } from '@/components/logo-mark';

const MeshViewer = dynamic(
  () => import('@/components/mesh-viewer').then((m) => m.MeshViewer),
  { ssr: false },
);

type ModelId = 'hunyuan3d-2' | 'trellis';

const MODELS: Array<{ id: ModelId; label: string; cost: string; latency: string; notes: string }> = [
  {
    id: 'hunyuan3d-2',
    label: 'Hunyuan3D-2 (Tencent)',
    cost: '~$0.18',
    latency: '60-120s',
    notes: 'Highest quality, best textures, slowest',
  },
  {
    id: 'trellis',
    label: 'Trellis (Microsoft)',
    cost: '~$0.04',
    latency: '15-30s',
    notes: 'Balanced quality/speed/cost',
  },
];

interface LabResult {
  ok: boolean;
  url?: string | null;
  rawOutput?: unknown;
  model: string;
  modelSlug?: string;
  durationMs: number;
  estimatedCostUsd?: number;
  error?: string;
}

export default function LabPage() {
  const [prompt, setPrompt] = useState('a cute red dragon');
  const [chosen, setChosen] = useState<ModelId>('trellis');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabResult | null>(null);

  async function generate() {
    if (prompt.trim().length < 3) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/lab/generate-3d', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, model: chosen }),
      });
      const data = (await res.json()) as LabResult;
      setResult(data);
    } catch (e) {
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : 'request failed',
        model: chosen,
        durationMs: 0,
      });
    } finally {
      setBusy(false);
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

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 p-6 md:p-10 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <section className="space-y-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-2">
              Prompt
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full resize-none border-2 border-ink bg-paper px-3 py-2 font-mono text-[13px] text-ink shadow-[3px_3px_0_var(--ink)] focus:bg-yellow focus:outline-none"
              placeholder="a cute red dragon"
              disabled={busy}
            />
          </section>

          <section className="space-y-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ink-2">
              Model
            </div>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-start gap-3 border-2 border-ink bg-paper p-3 ${
                    chosen === m.id
                      ? 'shadow-[5px_5px_0_var(--ink)]'
                      : 'shadow-[3px_3px_0_var(--ink)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="model"
                    checked={chosen === m.id}
                    onChange={() => setChosen(m.id)}
                    className="mt-0.5"
                    disabled={busy}
                  />
                  <div className="flex-1">
                    <div className="display-xl text-[14px] uppercase tracking-tight">
                      {m.label}
                    </div>
                    <div className="mt-0.5 flex gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
                      <span className="text-red font-bold">{m.cost}</span>
                      <span className="text-ink-2">·</span>
                      <span className="text-ink-2">{m.latency}</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-ink-2">
                      {m.notes}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={generate}
            disabled={busy || prompt.trim().length < 3}
            className="press w-full bg-red px-6 py-3 font-mono text-[12px] font-bold uppercase tracking-[0.18em] text-paper disabled:bg-ink-2"
          >
            {busy ? 'Generating · keep this tab open' : 'Generate 3D mesh →'}
          </button>

          <div className="border-t-2 border-dashed border-line-strong/60 pt-3 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-2">
            Set <span className="font-bold text-red">REPLICATE_API_TOKEN</span> in{' '}
            <code className="font-bold">.env.local</code> · grab one at replicate.com/account/api-tokens
          </div>

          <details className="border-2 border-ink bg-paper p-3 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-2">
            <summary className="cursor-pointer font-bold">Test Hyper3D / Rodin separately</summary>
            <div className="mt-2 space-y-1 normal-case tracking-normal">
              <div>Their playground: hyper3d.ai</div>
              <div>Pricing: $0.10–0.30/gen (premium)</div>
              <div>Tripo3D: tripo3d.ai · 600 free credits/mo</div>
              <div>Compare quality on the same prompt then decide.</div>
            </div>
          </details>
        </aside>

        <section className="space-y-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-ink-2">
            Result
          </div>
          <div className="aspect-square w-full overflow-hidden border-2 border-ink bg-paper-2/40">
            {result?.ok && result.url ? (
              <MeshViewer url={result.url} />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center">
                {busy ? (
                  <div className="space-y-1 font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2">
                    <div className="animate-pulse text-red font-bold">→ Calling Replicate</div>
                    <div>This can take 15-120s depending on the model</div>
                  </div>
                ) : result && !result.ok ? (
                  <div className="space-y-1 text-left font-mono text-[11px] text-red">
                    <div className="font-bold uppercase tracking-[0.14em]">Failed</div>
                    <div className="normal-case tracking-normal text-ink">{result.error}</div>
                  </div>
                ) : (
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-2">
                    No result yet · enter a prompt and generate
                  </div>
                )}
              </div>
            )}
          </div>

          {result?.ok && (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Model" value={result.model} />
              <Stat label="Duration" value={`${(result.durationMs / 1000).toFixed(1)}s`} />
              <Stat label="Cost (est)" value={`$${(result.estimatedCostUsd ?? 0).toFixed(3)}`} />
              {result.url && (
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press col-span-3 bg-paper px-3 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-ink"
                >
                  Download .glb / .obj
                </a>
              )}
            </div>
          )}

          {result?.ok && result.modelSlug && (
            <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-2">
              Model slug: <span className="font-bold text-ink">{result.modelSlug}</span>
            </div>
          )}
        </section>
      </div>
    </main>
  );
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
