import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { openaiClient } from '@/lib/openai/client';
import { serverEnv } from '@/lib/utils/env';

export const runtime = 'nodejs';
export const maxDuration = 60;

const requestSchema = z.object({
  prompt: z.string().trim().min(3).max(500),
});

const STYLE_ANCHOR =
  ' Single isolated subject, plain white seamless background, centered with margin, simple solid colors, soft even lighting, front view, no text, no watermark, no shadows on background.';

interface DalleResponse {
  ok: boolean;
  url?: string;
  promptUsed?: string;
  costUsd?: number;
  error?: string;
}

export async function POST(req: Request): Promise<NextResponse<DalleResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    );
  }

  const env = serverEnv();
  if (!env.OPENAI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'OPENAI_API_KEY not set' },
      { status: 400 },
    );
  }

  try {
    const promptUsed = parsed.data.prompt + STYLE_ANCHOR;
    const dalle = openaiClient();
    const resp = await dalle.images.generate({
      model: 'dall-e-3',
      prompt: promptUsed,
      size: '1024x1024',
      quality: 'standard',
      n: 1,
      response_format: 'url',
    });
    const url = resp.data?.[0]?.url;
    if (!url) throw new Error('DALL·E returned no URL');
    return NextResponse.json({ ok: true, url, promptUsed, costUsd: 0.04 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown' },
      { status: 502 },
    );
  }
}
