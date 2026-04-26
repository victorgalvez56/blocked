import { z } from 'zod';

export const generateRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(500),
  buildType: z.enum(['figure', 'basrelief', 'diorama']),
  maxBricks: z.number().int().min(50).max(500).default(250),
  seed: z.number().int().optional(),
  multiView: z.boolean().default(false),
});

export type GenerateRequest = z.infer<typeof generateRequestSchema>;
