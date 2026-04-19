import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, 'BOT_TOKEN is required'),
  GNEWS_API_KEY: z.string().min(1, 'GNEWS_API_KEY is required'),
  DEEPSEEK_API_KEY: z.string().min(1, 'DEEPSEEK_API_KEY is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'SUPABASE_SERVICE_KEY is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  INVITE_CODE: z.string().min(1, 'INVITE_CODE is required'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Missing or invalid environment variables:');
  for (const [field, errors] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`  ${field}: ${errors?.join(', ')}`);
  }
  process.exit(1);
}

export const config = parsed.data;
export const isDev = config.NODE_ENV === 'development';
