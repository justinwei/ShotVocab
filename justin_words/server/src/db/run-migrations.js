#!/usr/bin/env node
import { migrate } from './database.js';

try {
  migrate();
  console.log('Migrations applied successfully');
} catch (error) {
  console.error('Migration failed', error);
  process.exit(1);
}
