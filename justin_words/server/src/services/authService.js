import crypto from 'node:crypto';
import { config } from '../config.js';
import { getUserById } from './userService.js';

const DEFAULT_TOKEN_EXPIRY = '7d';

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString();
}

function parseDurationToSeconds(input) {
  if (!input) return 0;
  if (typeof input === 'number' && Number.isFinite(input)) {
    return Math.max(0, input);
  }
  const match = /^([0-9]+)([smhd])?$/i.exec(input.trim());
  if (!match) return 0;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() || 's';
  const multiplier = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 24 * 60 * 60
  }[unit];
  return amount * multiplier;
}

function getSecret() {
  return config.auth.jwtSecret || 'insecure-development-secret';
}

function hmacSign(input, secret) {
  return crypto.createHmac('sha256', secret).update(input).digest('base64url');
}

export function createAuthToken({ userId, expiresIn = config.auth.tokenTtl || DEFAULT_TOKEN_EXPIRY }) {
  const secret = getSecret();
  const issuedAt = Math.floor(Date.now() / 1000);
  const ttlSeconds = parseDurationToSeconds(expiresIn) || parseDurationToSeconds(DEFAULT_TOKEN_EXPIRY);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      sub: userId,
      iat: issuedAt,
      exp: issuedAt + ttlSeconds
    })
  );
  const signature = hmacSign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

export function verifyAuthToken(token) {
  if (!token) return null;
  const secret = getSecret();
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = hmacSign(`${encodedHeader}.${encodedPayload}`, secret);
  const providedBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }
    return payload;
  } catch (error) {
    console.error('[authService] failed to decode token', error);
    return null;
  }
}

export function resolveUserFromToken(token) {
  const payload = verifyAuthToken(token);
  if (!payload?.sub) return null;
  return getUserById(payload.sub);
}
