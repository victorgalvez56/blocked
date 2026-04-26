import { z } from 'zod';

const blankToUndef = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const serverSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_DAILY_BUDGET_USD: z.coerce.number().positive().default(20),
  SUPABASE_SERVICE_ROLE_KEY: blankToUndef,
  UPSTASH_REDIS_REST_URL: blankToUndef,
  UPSTASH_REDIS_REST_TOKEN: blankToUndef,
  REPLICATE_API_TOKEN: blankToUndef,
  REPLICATE_HUNYUAN3D_MODEL: blankToUndef,
  REPLICATE_TRELLIS_MODEL: blankToUndef,
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: blankToUndef,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: blankToUndef,
});

let cachedServer: z.infer<typeof serverSchema> | null = null;

export function serverEnv(): z.infer<typeof serverSchema> {
  if (cachedServer) return cachedServer;
  cachedServer = serverSchema.parse(process.env);
  return cachedServer;
}

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
