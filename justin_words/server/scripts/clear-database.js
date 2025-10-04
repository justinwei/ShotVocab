#!/usr/bin/env node
/**
 * 清除数据库内容脚本
 * 清空所有表的数据，但保留表结构
 * 
 * 使用方法：
 *   node scripts/clear-database.js
 *   或
 *   npm run clear-db
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库路径
const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '../data/justin_words.db');

// 创建确认接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askConfirmation() {
  return new Promise((resolve) => {
    rl.question('\n⚠️  警告：此操作将删除所有数据，但保留表结构。是否继续？(yes/no): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function clearDatabase() {
  console.log('='.repeat(60));
  console.log('清除数据库内容');
  console.log('='.repeat(60));
  console.log(`数据库路径: ${DB_PATH}\n`);

  // 确认操作
  const confirmed = await askConfirmation();
  
  if (!confirmed) {
    console.log('\n❌ 操作已取消');
    process.exit(0);
  }

  try {
    const db = new Database(DB_PATH);

    console.log('\n开始清除数据...\n');

    // 获取所有表名
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      AND name NOT LIKE 'sqlite_%'
    `).all();

    console.log(`找到 ${tables.length} 个表：`);
    tables.forEach(({ name }) => console.log(`  - ${name}`));

    // 禁用外键约束（清除数据时）
    db.prepare('PRAGMA foreign_keys = OFF').run();

    // 清空每个表
    let clearedCount = 0;
    for (const { name } of tables) {
      try {
        const result = db.prepare(`DELETE FROM ${name}`).run();
        console.log(`✅ 清空表 ${name} (删除 ${result.changes} 行)`);
        clearedCount++;
      } catch (err) {
        console.error(`❌ 清空表 ${name} 失败:`, err.message);
      }
    }

    // 重置自增 ID（如果表使用了 AUTOINCREMENT）
    console.log('\n重置自增序列...');
    try {
      db.prepare('DELETE FROM sqlite_sequence').run();
      console.log('✅ 自增序列已重置');
    } catch (err) {
      console.log('ℹ️  无需重置自增序列（表未使用 AUTOINCREMENT）');
    }

    // 重新启用外键约束
    db.prepare('PRAGMA foreign_keys = ON').run();

    // 优化数据库
    console.log('\n优化数据库...');
    db.prepare('VACUUM').run();
    console.log('✅ 数据库已优化');

    db.close();

    console.log('\n' + '='.repeat(60));
    console.log(`✅ 成功清空 ${clearedCount}/${tables.length} 个表`);
    console.log('='.repeat(60));

  } catch (err) {
    console.error('\n❌ 清除数据库失败:', err);
    process.exit(1);
  }
}

// 执行清除
clearDatabase().catch(console.error);
