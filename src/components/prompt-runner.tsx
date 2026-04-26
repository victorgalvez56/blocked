'use client';

import { useState } from 'react';
import { VoxelPreview } from './voxel-preview';
import type { GenerateApiResponse } from '@/types/api.types';
import type { GenerationResult } from '@/types/generation-job.types';

type BuildType = 'figure' | 'basrelief' | 'diorama';

const BUILD_TYPES: Array<{ id: BuildType; label: string; hint: string }> = [
  { id: 'figure', label: 'Figure', hint: '3D standalone (a dragon)' },
  { id: 'basrelief', label: 'Bas-relief', hint: 'Mosaic with depth (a portrait)' },
  { id: 'diorama', label: 'Diorama', hint: 'Figure on a base (a scene)' },
];

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; result: GenerationResult }
  | { kind: 'error'; message: string };

export function PromptRunner() {
  const [prompt, setPrompt] = useState('');
  const [buildType, setBuildType] = useState<BuildType>('figure');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim().length < 3) return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, buildType }),
      });
      const data = (await res.json()) as GenerateApiResponse;
      if (!data.ok) {
        setState({ kind: 'error', message: data.error });
        return;
      }
      setState({ kind: 'ready', result: data.result });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">blocked</h1>
        <p className="text-sm text-neutral-400">
          From idea to a buildable 3D Lego figure in seconds.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex gap-2">
          {BUILD_TYPES.map((bt) => (
            <button
              key={bt.id}
              type="button"
              onClick={() => setBuildType(bt.id)}
              className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition ${
                buildType === bt.id
                  ? 'border-white bg-white text-black'
                  : 'border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500'
              }`}
            >
              <div className="font-medium">{bt.label}</div>
              <div
                className={`text-xs ${buildType === bt.id ? 'text-neutral-600' : 'text-neutral-500'}`}
              >
                {bt.hint}
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A red dragon perched on a rock"
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-white placeholder:text-neutral-500 focus:border-white focus:outline-none"
            disabled={state.kind === 'loading'}
            maxLength={500}
            required
            minLength={3}
          />
          <button
            type="submit"
            disabled={state.kind === 'loading' || prompt.trim().length < 3}
            className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {state.kind === 'loading' ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </form>

      {state.kind === 'loading' && (
        <div className="flex h-96 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-sm text-neutral-400">
          DALL·E 3 → GPT-4o voxelizing… (15–30s)
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300">
          <div className="mb-1 font-semibold">Generation failed</div>
          <div className="font-mono text-xs">{state.message}</div>
        </div>
      )}

      {state.kind === 'ready' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-neutral-500">Reference</div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={state.result.imageUrl}
              alt={state.result.promptUsed}
              className="w-full rounded-lg border border-neutral-800"
            />
            <div className="text-xs text-neutral-500">
              {state.result.voxelPlan.voxels.length} voxels · ${state.result.costUsd.toFixed(3)}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-neutral-500">3D preview</div>
            <div className="aspect-square w-full overflow-hidden rounded-lg border border-neutral-800">
              <VoxelPreview plan={state.result.voxelPlan} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
