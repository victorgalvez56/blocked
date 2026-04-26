import type { GenerationRequest, GenerationResult } from './generation-job.types';

export type GenerateApiRequest = GenerationRequest;

export type GenerateApiResponse =
  | { ok: true; result: GenerationResult }
  | {
      ok: false;
      error: string;
      code: 'rate_limited' | 'bad_input' | 'openai_failed' | 'budget_exceeded' | 'unknown';
    };
