#!/usr/bin/env node
/**
 * 快速清除数据库内容（无需确认）
 * 用于开发环境快速重置数据
 * 
 * 使用方法：
 *   node scripts/clear-database-fast.js
 *   或
 *   npm run clear-db:fast
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../data/justin_words.db');

function clearDatabase() {
  console.log('🗑️  快速清除数据库...');
  
  try {
    const db = new Database(DB_PATH);

    // 获取所有表名
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
    `).all();

    // 禁用外键约束
    db.prepare('PRAGMA foreign_keys = OFF').run();

    // 清空每个表
    for (const { name } of tables) {
      db.prepare(`DELETE FROM ${name}`).run();
    }

    // 重置自增序列
    try {
      db.prepare('DELETE FROM sqlite_sequence').run();
    } catch (err) {
      // 忽略错误
    }

    // 重新启用外键约束
    db.prepare('PRAGMA foreign_keys = ON').run();

    // 优化数据库
    db.prepare('VACUUM').run();

    db.close();

    console.log(`✅ 已清空 ${tables.length} 个表`);
    console.log('✅ 数据库已优化');

  } catch (err) {
    console.error('❌ 清除失败:', err.message);
    process.exit(1);
  }
}

clearDatabase();
