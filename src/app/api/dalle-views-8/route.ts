import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { toFile } from 'openai/uploads';
import { openaiClient } from '@/lib/openai/client';
import { serverEnv } from '@/lib/utils/env';

export const runtime = 'nodejs';
export const maxDuration = 600;

const requestSchema = z.object({
  prompt: z.string().trim().min(3).max(400),
});

const STYLE_ANCHOR =
  ' Plain white seamless background. Centered, fills ~70% of frame. Solid colors only. Soft even lighting. No text. No watermark.';

const VIEW_KEYS = [
  'front',
  'fr',
  'right',
  'br',
  'back',
  'bl',
  'left',
  'fl',
] as const;
type ViewKey8 = (typeof VIEW_KEYS)[number];

const VIEW_PHRASES: Record<ViewKey8, string> = {
  front: 'Front orthographic view, character facing camera directly, fully visible from head to feet, perfectly upright',
  fr: '3/4 front-right angle view, character rotated 45 degrees clockwise from front, fully visible, perfectly upright',
  right: 'Right side profile view, character facing left, fully visible from head to feet, perfectly upright',
  br: '3/4 back-right angle view, looking at character from back-right, character rotated 135 degrees clockwise from front',
  back: 'Back view from directly behind, fully visible from head to feet, perfectly upright',
  bl: '3/4 back-left angle view, looking at character from back-left',
  left: 'Left side profile view, character facing right, fully visible, perfectly upright',
  fl: '3/4 front-left angle view, character rotated 45 degrees counter-clockwise from front',
};

interface Views8Response {
  ok: boolean;
  urls?: Record<ViewKey8, string>;
  costUsd?: number;
  durationMs: number;
  error?: string;
}

function dataUrlFromB64(b64: string): string {
  return `data:image/png;base64,${b64}`;
}

export async function POST(req: Request): Promise<NextResponse<Views8Response>> {
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
    const frontResp = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: `${VIEW_PHRASES.front} of ${subject}.${STYLE_ANCHOR}`,
      size: '1024x1024',
      quality: 'medium',
    });
    const frontB64 = frontResp.data?.[0]?.b64_json;
    if (!frontB64) throw new Error('gpt-image-1 front returned no image data');

    const frontBuffer = Buffer.from(frontB64, 'base64');
    const frontFile = await toFile(frontBuffer, 'front.png', { type: 'image/png' });

    const others: Array<Exclude<ViewKey8, 'front'>> = [
      'fr',
      'right',
      'br',
      'back',
      'bl',
      'left',
      'fl',
    ];

    const editResults = await Promise.all(
      others.map((key) =>
        openai.images.edit({
          model: 'gpt-image-1',
          image: frontFile,
          prompt: `Show this exact same character: ${VIEW_PHRASES[key]}. Same character, same proportions, same colors as the reference image.${STYLE_ANCHOR}`,
          size: '1024x1024',
        }),
      ),
    );

    const urls: Partial<Record<ViewKey8, string>> = {
      front: dataUrlFromB64(frontB64),
    };
    for (let i = 0; i < others.length; i++) {
      const key = others[i];
      const b64 = editResults[i].data?.[0]?.b64_json;
      if (!b64) throw new Error(`edit returned no data for ${key}`);
      urls[key] = dataUrlFromB64(b64);
    }

    return NextResponse.json({
      ok: true,
      urls: urls as Record<ViewKey8, string>,
      costUsd: 0.34, // 8 × ~$0.042
      durationMs: Date.now() - start,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'gpt-image-1 8-view batch failed',
        durationMs: Date.now() - start,
      },
      { status: 502 },
    );
  }
}
