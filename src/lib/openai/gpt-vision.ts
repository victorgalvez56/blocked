import 'server-only';
import { openaiClient } from './client';
import { VOXELIZER_SYSTEM_PROMPT, voxelizerUserPrompt } from './prompts';
import { availableColors } from '@/lib/palette';
import type { BuildType } from '@/types/generation-job.types';
import type { VoxelGridSnapshot } from '@/types/voxel.types';
import { cleanVoxelPlan, parseVoxelPlan } from '@/lib/validators/voxel-plan';

export interface GptVisionResult {
  plan: VoxelGridSnapshot;
  costUsd: number;
  raw: unknown;
  warnings: string[];
  droppedFloats: number;
}

const GPT4O_VISION_COST_ESTIMATE = 0.025;

const VOXEL_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['size', 'voxels', 'baseplate'],
  properties: {
    size: {
      type: 'object',
      additionalProperties: false,
      required: ['x', 'y', 'z'],
      properties: {
        x: { type: 'integer', minimum: 1, maximum: 24 },
        y: { type: 'integer', minimum: 1, maximum: 24 },
        z: { type: 'integer', minimum: 1, maximum: 24 },
      },
    },
    baseplate: {
      type: 'object',
      additionalProperties: false,
      required: ['width', 'depth'],
      properties: {
        width: { type: 'integer', minimum: 8, maximum: 32 },
        depth: { type: 'integer', minimum: 8, maximum: 32 },
      },
    },
    voxels: {
      type: 'array',
      maxItems: 500,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['coord', 'colorId', 'brickId', 'rotation'],
        properties: {
          coord: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: { type: 'integer', minimum: 0, maximum: 23 },
          },
          colorId: { type: 'string' },
          brickId: { type: 'string' },
          rotation: { type: 'integer', enum: [0, 90, 180, 270] },
        },
      },
    },
  },
} as const;

export async function imageToVoxelPlan(args: {
  imageUrl: string;
  buildType: BuildType;
  maxBricks: number;
}): Promise<GptVisionResult> {
  const client = openaiClient();
  const palette = availableColors();
  const paletteSummary = palette.map((c) => c.id).join(', ');

  const userText = voxelizerUserPrompt({
    buildType: args.buildType,
    maxBricks: args.maxBricks,
    paletteSummary,
  });

  const completion = await client.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'voxel_plan',
        strict: true,
        schema: VOXEL_PLAN_JSON_SCHEMA,
      },
    },
    messages: [
      { role: 'system', content: VOXELIZER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: args.imageUrl, detail: 'high' } },
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('gpt-4o returned empty content');

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(content);
  } catch {
    throw new Error('gpt-4o returned non-JSON content');
  }

  const parsed = parseVoxelPlan(parsedJson);
  if ('error' in parsed) {
    throw new Error(`gpt-4o plan failed schema validation: ${parsed.error}`);
  }

  const { cleaned, warnings, droppedCount } = cleanVoxelPlan(parsed.plan);

  if (cleaned.voxels.length === 0) {
    throw new Error('gpt-4o plan was empty after cleaning floating voxels');
  }

  const dropRatio = droppedCount / parsed.plan.voxels.length;
  if (dropRatio > 0.5) {
    throw new Error(
      `gpt-4o plan dropped ${droppedCount}/${parsed.plan.voxels.length} voxels as floating — too unstable`,
    );
  }

  return {
    plan: cleaned,
    costUsd: GPT4O_VISION_COST_ESTIMATE,
    raw: parsedJson,
    warnings,
    droppedFloats: droppedCount,
  };
}
