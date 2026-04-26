import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toFile } from 'openai/uploads';
import { openaiClient } from '@/lib/openai/client';
import { serverEnv } from '@/lib/utils/env';

export const runtime = 'nodejs';
export const maxDuration = 240;

const requestSchema = z.object({
  prompt: z.string().trim().min(3).max(400),
});

const STYLE_ANCHOR =
  ' Plain white seamless background. Centered, fills ~70% of frame. Solid colors only. Soft even lighting. No text. No watermark.';

const VIEWS = ['front', 'side', 'back', 'top'] as const;
type ViewKey = (typeof VIEWS)[number];

interface ViewsResponse {
  ok: boolean;
  urls?: Record<ViewKey, string>;
  costUsd?: number;
  durationMs: number;
  modelUsed?: string;
  error?: string;
}

function dataUrlFromB64(b64: string): string {
  return `data:image/png;base64,${b64}`;
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
  const openai = openaiClient();

  try {
    // 1. Generate front view as the reference. gpt-image-1 returns base64 by default.
    const frontResp = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: `Front orthographic view of ${subject}, character facing camera directly, fully visible from head to feet, perfectly upright.${STYLE_ANCHOR}`,
      size: '1024x1024',
      quality: 'medium',
    });
    const frontB64 = frontResp.data?.[0]?.b64_json;
    if (!frontB64) throw new Error('gpt-image-1 front returned no image data');

    // 2. Build a File-like for use as reference in subsequent edit calls
    const frontBuffer = Buffer.from(frontB64, 'base64');
    const frontFile = await toFile(frontBuffer, 'front.png', { type: 'image/png' });

    // 3. Generate side / back / top using the FRONT as reference image — preserves identity
    const editPrompts: Record<Exclude<ViewKey, 'front'>, string> = {
      side: `Show this exact same character from the right side profile view. Same character, same proportions, same colors as the reference image. Character facing left, fully visible from head to feet, perfectly upright.${STYLE_ANCHOR}`,
      back: `Show this exact same character from directly behind. Same character, same proportions, same colors as the reference image. Fully visible from head to feet, perfectly upright.${STYLE_ANCHOR}`,
      top: `Show this exact same character from directly above, top-down orthographic view. Same character, same proportions, same colors as the reference image. Head at the center of the frame.${STYLE_ANCHOR}`,
    };

    const [sideResp, backResp, topResp] = await Promise.all([
      openai.images.edit({
        model: 'gpt-image-1',
        image: frontFile,
        prompt: editPrompts.side,
        size: '1024x1024',
      }),
      openai.images.edit({
        model: 'gpt-image-1',
        image: frontFile,
        prompt: editPrompts.back,
        size: '1024x1024',
      }),
      openai.images.edit({
        model: 'gpt-image-1',
        image: frontFile,
        prompt: editPrompts.top,
        size: '1024x1024',
      }),
    ]);

    const sideB64 = sideResp.data?.[0]?.b64_json;
    const backB64 = backResp.data?.[0]?.b64_json;
    const topB64 = topResp.data?.[0]?.b64_json;
    if (!sideB64 || !backB64 || !topB64) {
      throw new Error('one of the reference-edit views returned no data');
    }

    return NextResponse.json({
      ok: true,
      urls: {
        front: dataUrlFromB64(frontB64),
        side: dataUrlFromB64(sideB64),
        back: dataUrlFromB64(backB64),
        top: dataUrlFromB64(topB64),
      },
      // gpt-image-1 medium pricing: ~$0.042 per image × 4
      costUsd: 0.17,
      durationMs: Date.now() - start,
      modelUsed: 'gpt-image-1',
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'gpt-image-1 batch failed',
        durationMs: Date.now() - start,
      },
      { status: 502 },
    );
  }
}
