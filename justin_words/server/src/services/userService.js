import crypto from 'node:crypto';
import { getDb } from '../db/database.js';

const SALT_BYTES = 16;
const DEFAULT_ITERATIONS = Number(process.env.PBKDF2_ITERATIONS || 120000);
const KEY_LENGTH = 32;
const DIGEST = 'sha256';

function hashPassword(password, iterations = DEFAULT_ITERATIONS) {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const derived = crypto
    .pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
    .toString('hex');
  return `${iterations}:${salt}:${derived}`;
}

export function normalizeEmail(email) {
  if (!email) return '';
  return email.trim().toLowerCase();
}

export function createUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Email is required');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    throw new Error('Email is already registered');
  }

  const passwordHash = hashPassword(password);
  const info = db.prepare('INSERT INTO users(email, password_hash) VALUES (?, ?)').run(normalizedEmail, passwordHash);
  const record = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  return serializeUser(record);
}

export function getUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
}

export function getUserById(id) {
  if (!id) return null;
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function assertValidPassword(password) {
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }
}

export function verifyPassword({ password, passwordHash }) {
  if (!passwordHash) return false;
  const [iterationsStr, salt, storedHash] = passwordHash.split(':');
  if (!iterationsStr || !salt || !storedHash) return false;
  const iterations = Number.parseInt(iterationsStr, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const derived = crypto
    .pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST)
    .toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(storedHash, 'hex'), Buffer.from(derived, 'hex'));
  } catch (_) {
    return false;
  }
}

export function serializeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    settings: user.settings_json ? JSON.parse(user.settings_json) : {},
    createdAt: user.created_at
  };
}

export function updateUserPassword({ userId, password }) {
  assertValidPassword(password);
  const db = getDb();
  const passwordHash = hashPassword(password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}
