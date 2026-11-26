import { randomBytes } from 'node:crypto';

export function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const required = ['DB_HOST', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE'];
  for (const key of required) {
    if (typeof env[key] !== 'string' || !env[key])
      throw new Error(`Missing required environment variable: ${key}`);
  }

  const port = Number(env.DB_PORT ?? 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('DB_PORT must be a valid TCP port');
  const accessSecret =
    typeof env.JWT_ACCESS_SECRET === 'string' ? env.JWT_ACCESS_SECRET : '';
  const refreshSecret =
    typeof env.JWT_REFRESH_SECRET === 'string' ? env.JWT_REFRESH_SECRET : '';
  if (accessSecret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters');
  }
  if (refreshSecret.length < 32) {
    throw new Error('JWT_REFRESH_SECRET must contain at least 32 characters');
  }
  const cors = typeof env.CORS_ORIGINS === 'string' ? env.CORS_ORIGINS : '';
  if (!cors && env.NODE_ENV === 'production')
    throw new Error('CORS_ORIGINS is required in production');
  for (const origin of cors
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)) {
    if (origin === '*')
      throw new Error('CORS_ORIGINS cannot contain a wildcard');
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('CORS_ORIGINS must contain valid origins');
    }
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin
    ) {
      throw new Error(
        'CORS_ORIGINS entries must be plain HTTP(S) origins without paths',
      );
    }
    if (env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
      throw new Error('Production CORS origins must use HTTPS');
  }
  const sameSite =
    typeof env.COOKIE_SAME_SITE === 'string' ? env.COOKIE_SAME_SITE : 'lax';
  if (!['lax', 'strict', 'none'].includes(sameSite))
    throw new Error('COOKIE_SAME_SITE must be lax, strict, or none');
  const publicUrl =
    typeof env.API_PUBLIC_URL === 'string' ? env.API_PUBLIC_URL : '';
  const frontendUrl =
    typeof env.FRONTEND_URL === 'string' ? env.FRONTEND_URL : '';
  if (
    env.NODE_ENV === 'production' &&
    frontendUrl &&
    !frontendUrl.startsWith('https://')
  ) {
    throw new Error('FRONTEND_URL must use HTTPS in production');
  }
  if (
    sameSite === 'none' &&
    env.NODE_ENV === 'production' &&
    publicUrl &&
    !publicUrl.startsWith('https://')
  ) {
    throw new Error('COOKIE_SAME_SITE=none requires HTTPS in production');
  }
  if (env.EPS_ENABLED === 'true') {
    for (const key of [
      'EPS_USERNAME',
      'EPS_PASSWORD',
      'EPS_HASH_KEY',
      'EPS_MERCHANT_ID',
      'EPS_STORE_ID',
      'API_PUBLIC_URL',
    ]) {
      if (typeof env[key] !== 'string' || !env[key])
        throw new Error(`EPS is enabled but ${key} is missing`);
    }
    if (env.NODE_ENV === 'production' && !publicUrl.startsWith('https://')) {
      throw new Error(
        'API_PUBLIC_URL must use HTTPS in production when EPS is enabled',
      );
    }
  }
  for (const key of ['DB_SSL', 'EPS_ENABLED', 'EPS_SANDBOX', 'TRUST_PROXY']) {
    if (env[key] !== undefined && env[key] !== 'true' && env[key] !== 'false') {
      throw new Error(`${key} must be true or false`);
    }
  }
  return {
    ...env,
    DB_PORT: port,
    CORS_ORIGINS: cors,
    COOKIE_SAME_SITE: sameSite,
  };
}

export function generateSecret(): string {
  return randomBytes(48).toString('base64url');
}
