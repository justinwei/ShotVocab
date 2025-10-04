-- 给 reviews 表添加 user_id 字段并填充数据
-- 这样可以直接查询用户的复习任务，提高性能

-- 1. 添加 user_id 列
ALTER TABLE reviews ADD COLUMN user_id INTEGER;

-- 2. 从 words 表填充 user_id
UPDATE reviews 
SET user_id = (SELECT user_id FROM words WHERE words.id = reviews.word_id);

-- 3. 创建索引提高查询性能
CREATE INDEX IF NOT EXISTS idx_reviews_user_next_due 
ON reviews(user_id, next_due_at);
