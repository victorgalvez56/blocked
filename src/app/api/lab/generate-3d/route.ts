import 'server-only';
import { NextResponse } from 'next/server';
import Replicate from 'replicate';
import { serverEnv } from '@/lib/utils/env';

export const runtime = 'nodejs';
export const maxDuration = 600;

interface LabResponse {
  ok: boolean;
  url?: string | null;
  rawOutput?: unknown;
  modelSlug?: string;
  versionId?: string;
  status?: string;
  durationMs: number;
  error?: string;
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
  const prompt = String(formData.get('prompt') || '').trim();
  const file = formData.get('image') as File | null;

  if (!slug) {
    return NextResponse.json(
      { ok: false, error: 'model slug required', durationMs: 0 },
      { status: 400 },
    );
  }
  if (!prompt && (!file || file.size === 0)) {
    return NextResponse.json(
      { ok: false, error: 'image or prompt required', durationMs: 0 },
      { status: 400 },
    );
  }

  let imageDataUrl: string | undefined;
  if (file && file.size > 0) {
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: 'image too large (max 10MB)', durationMs: 0 },
        { status: 400 },
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'image/png';
    imageDataUrl = `data:${mime};base64,${buf.toString('base64')}`;
  }

  const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });
  const start = Date.now();

  const [ownerModel, explicitVersion] = slug.split(':');
  const [owner, name] = ownerModel.split('/');

  // Each model has different input schema. Send the right key.
  const useImagesArray =
    /trellis|hunyuan3d-2mv|hunyuan-3d-3\.1/i.test(ownerModel);

  const input: Record<string, unknown> = {};
  if (prompt) input.prompt = prompt;
  if (imageDataUrl) {
    if (useImagesArray) {
      input.images = [imageDataUrl];
    } else {
      input.image = imageDataUrl;
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
