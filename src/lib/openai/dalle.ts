import 'server-only';
import { openaiClient } from './client';
import { dallePromptFor } from './prompts';
import type { BuildType } from '@/types/generation-job.types';

export interface DalleResult {
  imageUrl: string;
  promptUsed: string;
  costUsd: number;
}

const DALLE_HD_COST = 0.08;

export async function generateReferenceImage(args: {
  prompt: string;
  buildType: BuildType;
}): Promise<DalleResult> {
  const promptUsed = dallePromptFor(args.buildType, args.prompt);
  const client = openaiClient();

  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt: promptUsed,
    n: 1,
    size: '1024x1024',
    quality: 'hd',
    response_format: 'url',
  });

  const url = response.data?.[0]?.url;
  if (!url) {
    throw new Error('dall-e returned no image url');
  }

  return { imageUrl: url, promptUsed, costUsd: DALLE_HD_COST };
}
