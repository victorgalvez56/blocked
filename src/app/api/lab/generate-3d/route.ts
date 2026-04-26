import 'server-only';
import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { z } from 'zod';
import { serverEnv } from '@/lib/utils/env';

export const runtime = 'nodejs';
export const maxDuration = 300;

const requestSchema = z.object({
  prompt: z.string().trim().min(3).max(500),
  model: z.enum(['hunyuan3d-2', 'trellis']),
});

const DEFAULT_MODEL_SLUGS: Record<string, `${string}/${string}` | `${string}/${string}:${string}`> = {
  'hunyuan3d-2': 'tencent/hunyuan3d-2',
  trellis: 'firtoz/trellis',
};

const ESTIMATED_COST_USD: Record<string, number> = {
  'hunyuan3d-2': 0.18,
  trellis: 0.04,
};

interface GenerateLabResponse {
  ok: boolean;
  url?: string | null;
  rawOutput?: unknown;
  model: string;
  modelSlug?: string;
  durationMs: number;
  estimatedCostUsd?: number;
  error?: string;
}

export async function POST(req: Request): Promise<NextResponse<GenerateLabResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid JSON', model: 'unknown', durationMs: 0 },
      { status: 400 },
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'invalid input',
        model: 'unknown',
        durationMs: 0,
      },
      { status: 400 },
    );
  }

  const env = serverEnv();
  if (!env.REPLICATE_API_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        error: 'REPLICATE_API_TOKEN not set in .env.local',
        model: parsed.data.model,
        durationMs: 0,
      },
      { status: 400 },
    );
  }

  const { prompt, model } = parsed.data;
  const overrideEnvKey =
    model === 'hunyuan3d-2' ? env.REPLICATE_HUNYUAN3D_MODEL : env.REPLICATE_TRELLIS_MODEL;
  const slug = (overrideEnvKey ?? DEFAULT_MODEL_SLUGS[model]) as
    | `${string}/${string}`
    | `${string}/${string}:${string}`;

  const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

  const start = Date.now();
  try {
    const output = await replicate.run(slug, { input: { prompt } });
    const durationMs = Date.now() - start;

    let url: string | null = null;
    if (typeof output === 'string') {
      url = output;
    } else if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      url = typeof first === 'string' ? first : null;
    } else if (output && typeof output === 'object') {
      const obj = output as Record<string, unknown>;
      const candidate =
        obj.mesh ?? obj.glb ?? obj.model_file ?? obj.output ?? obj.url ?? obj.file;
      if (typeof candidate === 'string') url = candidate;
    }

    return NextResponse.json({
      ok: true,
      url,
      rawOutput: output,
      model,
      modelSlug: slug,
      durationMs,
      estimatedCostUsd: ESTIMATED_COST_USD[model],
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'replicate call failed',
        model,
        modelSlug: slug,
        durationMs: Date.now() - start,
      },
      { status: 502 },
    );
  }
}
