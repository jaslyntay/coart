// Loads environment variables and fails fast if required ones are missing.
// Anything that needs config imports `config` from here, not from process.env directly.

import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}. See .env.example.`);
  }
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd: optional('NODE_ENV') === 'production',

  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  supabase: {
    url: required('SUPABASE_URL'),
    anonKey: required('SUPABASE_ANON_KEY'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },

  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: optional('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
  },

  resend: {
    apiKey: optional('RESEND_API_KEY'),
    fromEmail: optional('RESEND_FROM_EMAIL', 'applications@coart.com'),
    enabled: optional('RESEND_API_KEY') !== '',
  },
} as const;
