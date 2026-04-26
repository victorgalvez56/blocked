'use client';

import { useState } from 'react';
import { VoxelPreview } from './voxel-preview';
import type { GenerateApiResponse } from '@/types/api.types';
import type { GenerationResult } from '@/types/generation-job.types';

type BuildType = 'figure' | 'basrelief' | 'diorama';

const BUILD_TYPES: Array<{ id: BuildType; label: string; hint: string }> = [
  { id: 'figure', label: 'Figure', hint: '3D standalone' },
  { id: 'basrelief', label: 'Bas-relief', hint: 'Flat with depth' },
  { id: 'diorama', label: 'Diorama', hint: 'On a base' },
];

const SUGGESTIONS: Array<{ label: string; prompt: string; emoji: string }> = [
  { label: 'Red dragon', prompt: 'a red dragon with green eyes', emoji: '🐉' },
  { label: 'Astronaut', prompt: 'a chubby astronaut in a white spacesuit', emoji: '👨‍🚀' },
  { label: 'Robot', prompt: 'a friendly blue retro robot', emoji: '🤖' },
  { label: 'Pink cat', prompt: 'a cute pink cat sitting', emoji: '🐱' },
  { label: 'Wizard', prompt: 'a wizard with a tall purple hat and long beard', emoji: '🧙' },
  { label: 'Mushroom', prompt: 'a giant red mushroom with white spots', emoji: '🍄' },
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

  async function runWith(p: string, t: BuildType) {
    if (p.trim().length < 3) return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: p, buildType: t }),
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    runWith(prompt, buildType);
  }

  function pickSuggestion(s: (typeof SUGGESTIONS)[number]) {
    setPrompt(s.prompt);
    runWith(s.prompt, buildType);
  }

  const loading = state.kind === 'loading';

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">blocked</h1>
        <p className="text-sm text-neutral-400">
          From idea to a buildable 3D Lego figure in seconds.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex gap-2">
          {BUILD_TYPES.map((bt) => (
            <button
              key={bt.id}
              type="button"
              onClick={() => setBuildType(bt.id)}
              disabled={loading}
              className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition disabled:opacity-50 ${
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
            placeholder="A red dragon with green eyes"
            className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-4 py-3 text-base text-white placeholder:text-neutral-500 focus:border-white focus:outline-none disabled:opacity-50"
            disabled={loading}
            maxLength={200}
            required
            minLength={3}
          />
          <button
            type="submit"
            disabled={loading || prompt.trim().length < 3}
            className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
          >
            {loading ? 'Generating…' : 'Generate'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs uppercase tracking-wide text-neutral-500">Try</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => pickSuggestion(s)}
              disabled={loading}
              className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 text-xs text-neutral-300 transition hover:border-neutral-600 hover:text-white disabled:opacity-50"
            >
              <span className="mr-1">{s.emoji}</span>
              {s.label}
            </button>
          ))}
        </div>
      </form>

      {loading && (
        <div className="flex h-96 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950 text-sm text-neutral-400">
          <div className="space-y-1 text-center">
            <div className="font-mono">DALL·E 3 → voxelizing…</div>
            <div className="text-xs text-neutral-600">~15-20 seconds</div>
          </div>
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
              className="aspect-square w-full rounded-lg border border-neutral-800 object-cover"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-neutral-500">3D preview</div>
            <div className="aspect-square w-full overflow-hidden rounded-lg border border-neutral-800">
              <VoxelPreview plan={state.result.voxelPlan} />
            </div>
          </div>
          <div className="lg:col-span-2 flex items-center justify-between text-xs text-neutral-500">
            <span>
              {state.result.voxelPlan.voxels.length} voxels · {state.result.buildType}
            </span>
            <span>${state.result.costUsd.toFixed(3)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
