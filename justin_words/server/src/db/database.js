import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { config, paths } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!fs.existsSync(paths.dataDir)) {
  fs.mkdirSync(paths.dataDir, { recursive: true });
}

const db = new Database(config.databaseFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

export function getDb() {
  return db;
}

export function transactional(fn) {
  const database = getDb();
  const wrapped = database.transaction(fn);
  return (...args) => wrapped(...args);
}

export function migrate(migrationsDir = path.resolve(__dirname, './migrations')) {
  const database = getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      run_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set(database.prepare('SELECT name FROM migrations').all().map(row => row.name));

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter(name => name.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    if (applied.has(file)) continue;

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');
    database.exec('BEGIN');
    try {
      database.exec(sql);
      database.prepare('INSERT INTO migrations (name) VALUES (?)').run(file);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
}
