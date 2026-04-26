import { NextResponse } from 'next/server';
import { generateRequestSchema } from '@/lib/validators/generate-request';
import { generateReferenceImage } from '@/lib/openai/dalle';
import { imageToVoxelPlan } from '@/lib/openai/gpt-vision';
import { checkBudget, recordSpend } from '@/lib/utils/rate-limit';
import { jobId } from '@/lib/utils/nanoid';
import { PALETTE_VERSION } from '@/lib/palette';
import type { GenerateApiResponse } from '@/types/api.types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ESTIMATED_COST_SINGLE_VIEW = 0.105;

export async function POST(req: Request): Promise<NextResponse<GenerateApiResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid JSON', code: 'bad_input' },
      { status: 400 },
    );
  }

  const parsed = generateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input', code: 'bad_input' },
      { status: 400 },
    );
  }

  const budget = checkBudget(ESTIMATED_COST_SINGLE_VIEW);
  if (!budget.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: `daily budget reached ($${budget.spent.toFixed(2)} of $${budget.ceiling})`,
        code: 'budget_exceeded',
      },
      { status: 429 },
    );
  }

  try {
    const { prompt, buildType, maxBricks } = parsed.data;

    const dalle = await generateReferenceImage({ prompt, buildType });
    recordSpend(dalle.costUsd);

    const vision = await imageToVoxelPlan({
      imageUrl: dalle.imageUrl,
      buildType,
      maxBricks,
    });
    recordSpend(vision.costUsd);

    return NextResponse.json({
      ok: true,
      result: {
        jobId: jobId(),
        imageUrl: dalle.imageUrl,
        voxelPlan: vision.plan,
        promptUsed: dalle.promptUsed,
        buildType,
        generationMode: 'ai',
        paletteVersion: PALETTE_VERSION,
        costUsd: dalle.costUsd + vision.costUsd,
        createdAt: Date.now(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json(
      { ok: false, error: message, code: 'openai_failed' },
      { status: 502 },
    );
  }
}
