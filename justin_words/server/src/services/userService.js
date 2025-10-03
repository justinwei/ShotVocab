import { getDb } from '../db/database.js';

const DEFAULT_EMAIL = 'default@justin-words.local';

export function ensureDefaultUser() {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(DEFAULT_EMAIL);
  if (existing) return existing;
  const info = db.prepare('INSERT INTO users(email) VALUES (?)').run(DEFAULT_EMAIL);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

export function getUserById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}
