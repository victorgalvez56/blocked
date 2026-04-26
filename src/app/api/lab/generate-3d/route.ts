import 'server-only';
import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { serverEnv } from '@/lib/utils/env';
import { openaiClient } from '@/lib/openai/client';

export const runtime = 'nodejs';
export const maxDuration = 600;

interface LabResponse {
  ok: boolean;
  url?: string | null;
  referenceImageUrl?: string;
  referencePrompt?: string;
  dalleCostUsd?: number;
  rawOutput?: unknown;
  modelSlug?: string;
  versionId?: string;
  status?: string;
  durationMs: number;
  dalleDurationMs?: number;
  error?: string;
}

const DALLE_STYLE_ANCHOR =
  ' Single isolated subject, plain white seamless background, centered with margin, simple solid colors, soft even lighting, front 3/4 view, no text, no watermark, no shadows on background.';

async function generateReferenceImage(prompt: string): Promise<{ url: string; costUsd: number }> {
  const dalle = openaiClient();
  const resp = await dalle.images.generate({
    model: 'dall-e-3',
    prompt: prompt + DALLE_STYLE_ANCHOR,
    size: '1024x1024',
    quality: 'standard',
    n: 1,
    response_format: 'url',
  });
  const url = resp.data?.[0]?.url;
  if (!url) throw new Error('DALL·E returned no image URL');
  return { url, costUsd: 0.04 };
}

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

export async function POST(req: Request): Promise<NextResponse<LabResponse>> {
  const env = serverEnv();
  if (!env.REPLICATE_API_TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'REPLICATE_API_TOKEN not set in .env.local', durationMs: 0 },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid form data', durationMs: 0 },
      { status: 400 },
    );
  }

  const slug = String(formData.get('slug') || '').trim();
  const mode = String(formData.get('mode') || 'image') as 'text' | 'image';
  const prompt = String(formData.get('prompt') || '').trim();
  const file = formData.get('image') as File | null;

  if (!slug) {
    return NextResponse.json(
      { ok: false, error: 'model slug required', durationMs: 0 },
      { status: 400 },
    );
  }

  if (mode === 'text' && !prompt) {
    return NextResponse.json(
      { ok: false, error: 'prompt required for text mode', durationMs: 0 },
      { status: 400 },
    );
  }
  if (mode === 'image' && (!file || file.size === 0)) {
    return NextResponse.json(
      { ok: false, error: 'image required for image mode', durationMs: 0 },
      { status: 400 },
    );
  }

  let imageInput: string | undefined;
  let referenceImageUrl: string | undefined;
  let referencePrompt: string | undefined;
  let dalleCost = 0;
  let dalleDurationMs = 0;

  if (mode === 'text') {
    if (!env.OPENAI_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'text mode requires OPENAI_API_KEY (chains DALL·E → 3D)', durationMs: 0 },
        { status: 400 },
      );
    }
    const dalleStart = Date.now();
    try {
      const dalle = await generateReferenceImage(prompt);
      imageInput = dalle.url;
      referenceImageUrl = dalle.url;
      referencePrompt = prompt;
      dalleCost = dalle.costUsd;
      dalleDurationMs = Date.now() - dalleStart;
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: `DALL·E step failed: ${e instanceof Error ? e.message : 'unknown'}`,
          dalleDurationMs: Date.now() - dalleStart,
          durationMs: Date.now() - dalleStart,
        },
        { status: 502 },
      );
    }
  } else if (file && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: 'image too large (max 10MB)', durationMs: 0 },
        { status: 400 },
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'image/png';
    imageInput = `data:${mime};base64,${buf.toString('base64')}`;
  }

  const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });
  const start = Date.now();

  const [ownerModel, explicitVersion] = slug.split(':');
  const [owner, name] = ownerModel.split('/');

  // Each model has different input schema. Send the right key.
  const useImagesArray =
    /trellis|hunyuan3d-2mv|hunyuan-3d-3\.1/i.test(ownerModel);

  const input: Record<string, unknown> = {};
  // Only send prompt if explicitly in image mode with a typed prompt
  // In text mode the user prompt was already used for DALL·E
  if (mode === 'image' && prompt) input.prompt = prompt;
  if (imageInput) {
    if (useImagesArray) {
      input.images = [imageInput];
    } else {
      input.image = imageInput;
    }
  }
  if (!owner || !name) {
    return NextResponse.json(
      { ok: false, error: `invalid slug format "${slug}" (expected owner/model[:version])`, durationMs: 0 },
      { status: 400 },
    );
  }

  let versionId: string | undefined = explicitVersion;
  if (!versionId) {
    try {
      const model = await replicate.models.get(owner, name);
      versionId = model.latest_version?.id;
      if (!versionId) {
        return NextResponse.json(
          {
            ok: false,
            error: `model "${ownerModel}" has no public versions`,
            modelSlug: ownerModel,
            durationMs: Date.now() - start,
          },
          { status: 400 },
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'lookup failed';
      return NextResponse.json(
        {
          ok: false,
          error: `model "${ownerModel}" not found on replicate (${msg})`,
          modelSlug: ownerModel,
          durationMs: Date.now() - start,
        },
        { status: 404 },
      );
    }
  }

  try {
    let prediction = await replicate.predictions.create({ version: versionId, input });
    const pollStart = Date.now();
    while (!TERMINAL_STATUSES.has(prediction.status)) {
      if (Date.now() - pollStart > 9 * 60_000) {
        return NextResponse.json(
          {
            ok: false,
            error: 'timeout after 9 minutes',
            modelSlug: ownerModel,
            versionId,
            status: prediction.status,
            durationMs: Date.now() - start,
          },
          { status: 504 },
        );
      }
      await new Promise((r) => setTimeout(r, 2000));
      prediction = await replicate.predictions.get(prediction.id);
    }

    if (prediction.status !== 'succeeded') {
      return NextResponse.json(
        {
          ok: false,
          error: prediction.error ? String(prediction.error) : `prediction ${prediction.status}`,
          rawOutput: prediction.output,
          modelSlug: ownerModel,
          versionId,
          status: prediction.status,
          durationMs: Date.now() - start,
        },
        { status: 502 },
      );
    }

    const output = prediction.output;
    let url: string | null = null;
    if (typeof output === 'string') {
      url = output;
    } else if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      url = typeof first === 'string' ? first : null;
    } else if (output && typeof output === 'object') {
      const obj = output as Record<string, unknown>;
      const candidate =
        obj.mesh ??
        obj.glb ??
        obj.model_file ??
        obj.model ??
        obj.output ??
        obj.url ??
        obj.file ??
        obj.gaussian_ply;
      if (typeof candidate === 'string') url = candidate;
    }

    return NextResponse.json({
      ok: true,
      url,
      referenceImageUrl,
      referencePrompt,
      dalleCostUsd: dalleCost > 0 ? dalleCost : undefined,
      dalleDurationMs: dalleDurationMs > 0 ? dalleDurationMs : undefined,
      rawOutput: output,
      modelSlug: ownerModel,
      versionId,
      status: prediction.status,
      durationMs: Date.now() - start,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : 'unknown error',
        modelSlug: ownerModel,
        versionId,
        durationMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
}
