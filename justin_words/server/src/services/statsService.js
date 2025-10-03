import { getDb } from '../db/database.js';

export function incrementDailyStats({ userId, day, newWordsDelta = 0, reviewsDelta = 0 }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO daily_stats(user_id, day, new_words, reviews_completed)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, day) DO UPDATE SET
      new_words = new_words + excluded.new_words,
      reviews_completed = reviews_completed + excluded.reviews_completed
  `);
  stmt.run(userId, day, newWordsDelta, reviewsDelta);
}

export function fetchDailyStats({ userId, start, end, limit = 30 }) {
  const db = getDb();
  return db.prepare(`
    SELECT day, new_words AS newWords, reviews_completed AS reviewsCompleted
    FROM daily_stats
    WHERE user_id = ? AND day BETWEEN ? AND ?
    ORDER BY day DESC
    LIMIT ?
  `).all(userId, start, end, limit);
}
