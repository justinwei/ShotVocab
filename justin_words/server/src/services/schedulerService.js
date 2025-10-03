import { getDb } from '../db/database.js';
import { incrementDailyStats } from './statsService.js';

const RATING_MAP = {
  familiar: { easeDelta: 0.15, multiplier: 2.2, minIntervalMinutes: 1440 },
  simple: { easeDelta: 0.05, multiplier: 1.4, minIntervalMinutes: 720 },
  unfamiliar: { easeDelta: -0.3, multiplier: 0.5, minIntervalMinutes: 10 }
};

const CHINESE_LABELS = {
  '熟悉': 'familiar',
  '简单': 'simple',
  '生词': 'unfamiliar'
};

function normalizeRating(rating) {
  if (!rating) throw new Error('Rating is required');
  if (CHINESE_LABELS[rating]) return CHINESE_LABELS[rating];
  const lowered = rating.toString().toLowerCase();
  if (['familiar', 'easy'].includes(lowered)) return 'familiar';
  if (['simple', 'good', 'ok', 'normal'].includes(lowered)) return 'simple';
  if (['unfamiliar', 'again', 'hard', 'fail'].includes(lowered)) return 'unfamiliar';
  throw new Error(`Unsupported rating: ${rating}`);
}

function computeNextInterval(prevIntervalMinutes, ease, ratingKey) {
  const policy = RATING_MAP[ratingKey];
  if (!policy) throw new Error(`Unknown rating key: ${ratingKey}`);

  if (ratingKey === 'unfamiliar') {
    return {
      intervalMinutes: Math.max(policy.minIntervalMinutes, 10),
      ease: Math.max(1.3, ease + policy.easeDelta)
    };
  }

  const base = prevIntervalMinutes > 0 ? prevIntervalMinutes : policy.minIntervalMinutes;
  const intervalMinutes = Math.max(policy.minIntervalMinutes, Math.round(base * policy.multiplier));
  const nextEase = Math.min(2.8, Math.max(1.3, ease + policy.easeDelta));
  return {
    intervalMinutes,
    ease: nextEase
  };
}

function nextDueFromInterval(intervalMinutes, baseDate = new Date()) {
  return new Date(baseDate.getTime() + intervalMinutes * 60 * 1000);
}

export function scheduleInitialReview({ wordId, userId, now = new Date() }) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM reviews WHERE word_id = ?').get(wordId);
  if (existing) return existing;

  const intervalMinutes = 10; // first relearn check in 10 minutes
  const nextDueAt = nextDueFromInterval(intervalMinutes, now);
  const info = db.prepare(`
    INSERT INTO reviews(word_id, scheduled_at, interval, easiness_factor, next_due_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(wordId, now.toISOString(), intervalMinutes, 2.5, nextDueAt.toISOString());

  incrementDailyStats({ userId, day: now.toISOString().slice(0, 10), newWordsDelta: 1 });
  return { reviewId: info.lastInsertRowid, nextDueAt: nextDueAt.toISOString() };
}

export function fetchDueReviews({ userId, limit = 20, now = new Date() }) {
  const db = getDb();
  return db.prepare(`
    SELECT r.id AS reviewId, r.word_id AS wordId, w.lemma, w.audio_url AS audioUrl,
           m.en_definition AS enDefinition, m.en_example AS enExample,
           m.zh_definition AS zhDefinition, m.zh_example AS zhExample,
           r.next_due_at AS nextDueAt
    FROM reviews r
    JOIN words w ON w.id = r.word_id
    LEFT JOIN word_metadata m ON m.word_id = w.id
    WHERE w.user_id = ? AND (r.next_due_at IS NULL OR r.next_due_at <= ?)
    ORDER BY r.next_due_at ASC
    LIMIT ?
  `).all(userId, now.toISOString(), limit);
}

export function recordReviewResult({ reviewId, rating, now = new Date() }) {
  const db = getDb();
  const row = db.prepare(`
    SELECT r.*, w.user_id AS userId
    FROM reviews r
    JOIN words w ON w.id = r.word_id
    WHERE r.id = ?
  `).get(reviewId);

  if (!row) {
    throw new Error(`Review ${reviewId} not found`);
  }

  const ratingKey = normalizeRating(rating);
  const prevInterval = row.interval || 10;
  const prevEase = row.easiness_factor || 2.5;
  const { intervalMinutes, ease } = computeNextInterval(prevInterval, prevEase, ratingKey);
  const nextDue = nextDueFromInterval(intervalMinutes, now);

  db.prepare(`
    UPDATE reviews
    SET reviewed_at = ?, outcome = ?, interval = ?, easiness_factor = ?, next_due_at = ?
    WHERE id = ?
  `).run(now.toISOString(), ratingKey, intervalMinutes, ease, nextDue.toISOString(), reviewId);

  db.prepare(`
    INSERT INTO review_log(word_id, review_id, outcome, easiness_factor, interval, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.word_id, reviewId, ratingKey, ease, intervalMinutes, now.toISOString());

  incrementDailyStats({ userId: row.userId, day: now.toISOString().slice(0, 10), reviewsDelta: 1 });

  return {
    reviewId,
    wordId: row.word_id,
    intervalMinutes,
    ease,
    nextDueAt: nextDue.toISOString(),
    rating: ratingKey
  };
}

export function summarizeDailyStats({ userId, start, end }) {
  const db = getDb();
  return db.prepare(`
    SELECT day, new_words AS newWords, reviews_completed AS reviewsCompleted
    FROM daily_stats
    WHERE user_id = ? AND day BETWEEN ? AND ?
    ORDER BY day
  `).all(userId, start, end);
}
