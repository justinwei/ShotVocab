import t from 'tap';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const fixtureBasename = '1759423636054-4xsywi5r57r.jpg';
const fixturePath = path.resolve(process.cwd(), '..', 'uploads', fixtureBasename);

function withTempEnv() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'justin-words-test-'));
  const originalEnv = {
    SQLITE_PATH: process.env.SQLITE_PATH,
    UPLOADS_DIR: process.env.UPLOADS_DIR,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_FORCE_MOCK: process.env.GEMINI_FORCE_MOCK
  };

  process.env.SQLITE_PATH = path.join(tmpRoot, 'db.sqlite');
  process.env.UPLOADS_DIR = path.join(tmpRoot, 'uploads');
  process.env.GEMINI_API_KEY = '';
  process.env.GEMINI_FORCE_MOCK = '1';

  return {
    tmpRoot,
    originalEnv,
    cleanup() {
      const dbFile = process.env.SQLITE_PATH;
      if (originalEnv.SQLITE_PATH === undefined) {
        delete process.env.SQLITE_PATH;
      } else {
        process.env.SQLITE_PATH = originalEnv.SQLITE_PATH;
      }
      if (originalEnv.UPLOADS_DIR === undefined) {
        delete process.env.UPLOADS_DIR;
      } else {
        process.env.UPLOADS_DIR = originalEnv.UPLOADS_DIR;
      }
      if (originalEnv.GEMINI_API_KEY === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;
      }
      if (originalEnv.GEMINI_FORCE_MOCK === undefined) {
        delete process.env.GEMINI_FORCE_MOCK;
      } else {
        process.env.GEMINI_FORCE_MOCK = originalEnv.GEMINI_FORCE_MOCK;
      }
      try {
        fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
      } catch (_) {
        // best effort cleanup
      }
    }
  };
}

t.test('ingestWordFromImage processes uploaded image end-to-end', async (t) => {
  const env = withTempEnv();
  t.teardown(() => {
    env.cleanup();
  });

  const databaseModule = await import('../src/db/database.js');
  const { migrate, getDb } = databaseModule;
  const { ensureDefaultUser } = await import('../src/services/userService.js');
  const { ingestWordFromImage, listWordsWithMetadata } = await import('../src/services/wordService.js');

  migrate();
  const user = ensureDefaultUser();

  let buffer;
  if (fs.existsSync(fixturePath)) {
    buffer = fs.readFileSync(fixturePath);
  } else {
    buffer = Buffer.from('unit-test image placeholder');
    t.comment(`fixture image not found at ${fixturePath}, using placeholder buffer`);
  }

  const result = await ingestWordFromImage({
    buffer,
    originalname: fixtureBasename,
    mimetype: 'image/jpeg'
  });

  t.ok(Array.isArray(result.words), 'should return a list of words');
  t.equal(result.words.length, 1, 'mock output yields single word');
  const [word] = result.words;
  t.equal(word.lemma, 'example', 'should use mock OCR lemma');
  t.equal(word.confidence, 0.42, 'should expose mock OCR confidence');
  t.ok(fs.existsSync(word.imagePath), 'based image file should be persisted');
  t.ok(word.audioUrl, 'word pronunciation audio url returned');
  const audioFilePath = path.resolve(process.env.UPLOADS_DIR, word.audioUrl.replace(/^\/uploads\//, ''));
  t.ok(fs.existsSync(audioFilePath), 'audio file persisted to disk');

  const stored = getDb()
    .prepare('SELECT lemma, image_path FROM words WHERE id = ?')
    .get(word.id);

  t.same(stored.lemma, 'example', 'word persisted in database');
  t.equal(
    stored.image_path,
    word.imagePath,
    'returned word image path matches database entry'
  );

  const metadata = getDb()
    .prepare('SELECT en_definition, en_example, zh_definition, zh_example FROM word_metadata WHERE word_id = ?')
    .get(word.id);

  t.match(metadata.en_definition, /example/i, 'english definition stored');
  t.match(metadata.en_example, /example/i, 'english example stored');
  t.match(metadata.zh_definition, /示例|占位/g, 'chinese definition stored');
  t.match(metadata.zh_example, /示例|包含/g, 'chinese example stored');

  const listed = listWordsWithMetadata({ userId: user.id });
  t.equal(listed.length, 1, 'list API returns one word');
  t.equal(listed[0].lemma, 'example', 'list entry lemma matches');
  t.match(listed[0].enDefinition, /example/i, 'list entry has english definition');
  t.equal(listed[0].audioUrl, word.audioUrl, 'list entry exposes audio url');

  getDb().close();
});
