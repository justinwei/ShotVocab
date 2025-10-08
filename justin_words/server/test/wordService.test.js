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
    GEMINI_FORCE_MOCK: process.env.GEMINI_FORCE_MOCK,
    JWT_SECRET: process.env.JWT_SECRET,
    AZURE_SPEECH_FORCE_MOCK: process.env.AZURE_SPEECH_FORCE_MOCK
  };

  process.env.SQLITE_PATH = path.join(tmpRoot, 'db.sqlite');
  process.env.UPLOADS_DIR = path.join(tmpRoot, 'uploads');
  process.env.GEMINI_API_KEY = '';
  process.env.GEMINI_FORCE_MOCK = '1';
  process.env.JWT_SECRET = 'test-secret';
  process.env.AZURE_SPEECH_FORCE_MOCK = '1';

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
      if (originalEnv.AZURE_SPEECH_FORCE_MOCK === undefined) {
        delete process.env.AZURE_SPEECH_FORCE_MOCK;
      } else {
        process.env.AZURE_SPEECH_FORCE_MOCK = originalEnv.AZURE_SPEECH_FORCE_MOCK;
      }
      if (originalEnv.JWT_SECRET === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalEnv.JWT_SECRET;
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
  const { createUser } = await import('../src/services/userService.js');
  const {
    ingestImageForUser,
    ingestWordsManually,
    listWordsWithMetadata,
    regenerateWordResources,
    createImagePreview,
    confirmImageImport
  } = await import('../src/services/wordService.js');

  migrate();
  const user = createUser({ email: 'test@example.com', password: 'secret123' });

  let buffer;
  if (fs.existsSync(fixturePath)) {
    buffer = fs.readFileSync(fixturePath);
  } else {
    buffer = Buffer.from('unit-test image placeholder');
    t.comment(`fixture image not found at ${fixturePath}, using placeholder buffer`);
  }

  const progressEvents = [];
  const wordsFromImage = await ingestImageForUser({
    userId: user.id,
    buffer,
    originalname: fixtureBasename,
    mimetype: 'image/jpeg',
    onProgress: (payload) => progressEvents.push(payload)
  });

  t.ok(progressEvents.find((event) => event.type === 'ocr'), 'progress emits OCR event');
  t.ok(progressEvents.find((event) => event.type === 'completed'), 'progress emits completion events');

  t.ok(Array.isArray(wordsFromImage), 'should return a list of words');
  t.equal(wordsFromImage.length, 1, 'mock output yields single word');
  const [word] = wordsFromImage;
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
  t.equal(listed.total, 1, 'list API reports total');
  t.equal(listed.words.length, 1, 'list API returns one word');
  t.equal(listed.words[0].lemma, 'example', 'list entry lemma matches');
  t.match(listed.words[0].enDefinition, /example/i, 'list entry has english definition');
  t.equal(listed.words[0].audioUrl, word.audioUrl, 'list entry exposes audio url');

  const manualResult = await ingestWordsManually({ userId: user.id, lemmas: ['sample', 'sample', 'test'] });
  t.equal(manualResult.length, 2, 'manual ingest handles duplicates and multi-word input');
  const manualList = listWordsWithMetadata({ userId: user.id, pageSize: 10 });
  t.ok(manualList.words.find((entry) => entry.lemma === 'sample'), 'manual word persisted');
  t.ok(manualList.words.find((entry) => entry.lemma === 'test'), 'second manual word persisted');

  const searchList = listWordsWithMetadata({ userId: user.id, search: 'sam' });
  t.equal(searchList.total, 1, 'search narrows total count');
  t.equal(searchList.words[0].lemma, 'sample', 'search result matches lemma');

  const paged = listWordsWithMetadata({ userId: user.id, page: 2, pageSize: 1 });
  t.equal(paged.words.length, 1, 'pagination returns limited results');
  t.ok(paged.total >= 3, 'pagination exposes total count across pages');

  const preview = await createImagePreview({
    userId: user.id,
    buffer,
    originalname: fixtureBasename,
    mimetype: 'image/jpeg'
  });
  t.ok(preview.uploadId, 'preview provides upload id');
  t.ok(Array.isArray(preview.words) && preview.words.length, 'preview returns candidates');

  const confirmed = await confirmImageImport({
    uploadId: preview.uploadId,
    userId: user.id,
    lemmas: preview.words.map((item) => item.lemma)
  });
  t.equal(confirmed.length, preview.words.length, 'confirm imports selected words');

  const regenerated = await regenerateWordResources({ userId: user.id, wordId: word.id });
  t.equal(regenerated.id, word.id, 'regeneration returns the same word id');
  t.equal(regenerated.lemma, word.lemma, 'regeneration keeps lemma');

  getDb().close();
});
