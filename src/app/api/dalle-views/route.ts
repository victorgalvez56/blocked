import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { openaiClient } from '@/lib/openai/client';
import { serverEnv } from '@/lib/utils/env';

export const runtime = 'nodejs';
export const maxDuration = 120;

const requestSchema = z.object({
  prompt: z.string().trim().min(3).max(400),
});

const STYLE_ANCHOR =
  ' Same exact character/object across all renders. Identical proportions and palette. Plain white seamless background. Centered, fills ~70% of frame. Solid colors only. Soft even lighting, no harsh shadows. No text. No watermark. No motion blur.';

const VIEWS = ['front', 'side', 'back', 'top'] as const;
type ViewKey = (typeof VIEWS)[number];

const VIEW_PHRASES: Record<ViewKey, string> = {
  front:
    'Front orthographic view of {SUBJECT}, facing the camera directly, fully visible from head to feet, perfectly upright.',
  side:
    'Side profile view of {SUBJECT}, perfect right profile, character facing left, fully visible from head to feet, perfectly upright.',
  back:
    'Back view of {SUBJECT}, from directly behind, fully visible from head to feet, perfectly upright.',
  top:
    'Top-down orthographic view of {SUBJECT}, looking straight down from above, head at the center of the frame.',
};

interface ViewsResponse {
  ok: boolean;
  urls?: Record<ViewKey, string>;
  promptsUsed?: Record<ViewKey, string>;
  costUsd?: number;
  durationMs: number;
  error?: string;
}

export async function POST(req: Request): Promise<NextResponse<ViewsResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid JSON', durationMs: 0 },
      { status: 400 },
    );
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'invalid input',
        durationMs: 0,
      },
      { status: 400 },
    );
  }

  const env = serverEnv();
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY not set', durationMs: 0 },
      { status: 400 },
    );
  }

  const subject = parsed.data.prompt;
  const start = Date.now();
  const dalle = openaiClient();

  const promptsUsed: Record<ViewKey, string> = {
    front: VIEW_PHRASES.front.replace('{SUBJECT}', subject) + STYLE_ANCHOR,
    side: VIEW_PHRASES.side.replace('{SUBJECT}', subject) + STYLE_ANCHOR,
    back: VIEW_PHRASES.back.replace('{SUBJECT}', subject) + STYLE_ANCHOR,
    top: VIEW_PHRASES.top.replace('{SUBJECT}', subject) + STYLE_ANCHOR,
  };

  try {
    const results = await Promise.all(
      VIEWS.map(async (view) => {
        const resp = await dalle.images.generate({
          model: 'dall-e-3',
          prompt: promptsUsed[view],
          size: '1024x1024',
          quality: 'standard',
          n: 1,
          response_format: 'url',
        });
        const url = resp.data?.[0]?.url;
        if (!url) throw new Error(`DALL·E ${view} returned no URL`);
        return [view, url] as const;
      }),
    );

    const urls = Object.fromEntries(results) as Record<ViewKey, string>;
    return NextResponse.json({
      ok: true,
      urls,
      promptsUsed,
      costUsd: 0.16,
      durationMs: Date.now() - start,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'DALL·E batch failed',
        durationMs: Date.now() - start,
      },
      { status: 502 },
    );
  }
}
