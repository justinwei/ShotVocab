import { Router } from 'express';
import {
  uploadMiddleware,
  ingestImageForUser,
  ingestWordsManually,
  createImagePreview,
  confirmImageImport,
  discardImagePreview,
  ensureChineseSupplement,
  getWordWithMetadata,
  listWordsWithMetadata,
  ensureWordAudioUrl,
  ensureDefinitionAudioUrl,
  ensureExampleAudioUrl,
  regenerateWordResources
} from '../services/wordService.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 500);
    const words = listWordsWithMetadata({ userId: req.user.id, limit });
    res.json({ words });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/audio', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { target = 'word' } = req.query;
    const wordId = Number(id);
    if (Number.isNaN(wordId)) {
      return res.status(400).json({ error: 'Invalid word id' });
    }

    let url;
    if (target === 'word') {
      url = await ensureWordAudioUrl(wordId, req.user.id);
    } else if (target === 'enDefinition') {
      url = await ensureDefinitionAudioUrl(wordId, req.user.id);
    } else if (target === 'enExample') {
      url = await ensureExampleAudioUrl(wordId, req.user.id);
    } else {
      return res.status(400).json({ error: 'Unsupported audio target' });
    }

    if (!url) {
      return res.status(404).json({ error: 'Audio unavailable' });
    }

    res.json({ url });
  } catch (error) {
    next(error);
  }
});

router.post('/image', uploadMiddleware, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required under field "image"' });
    }

    console.info('[words:image] received upload', {
      userId: req.user.id,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    const preview = await createImagePreview({
      userId: req.user.id,
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype
    });

    const words = await confirmImageImport({
      uploadId: preview.uploadId,
      userId: req.user.id,
      lemmas: preview.words.map((item) => item.lemma)
    });

    res.json({ words });
  } catch (error) {
    next(error);
  }
});

router.post('/image/preview', uploadMiddleware, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required under field "image"' });
    }

    const preview = await createImagePreview({
      userId: req.user.id,
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype
    });

    res.json(preview);
  } catch (error) {
    next(error);
  }
});

router.post('/image/confirm', async (req, res, next) => {
  try {
    const { uploadId, words = [], finalize = true } = req.body || {};
    if (!uploadId) {
      return res.status(400).json({ error: 'uploadId is required' });
    }
    if (!Array.isArray(words) || !words.length) {
      return res.status(400).json({ error: 'At least one word is required' });
    }
    const created = await confirmImageImport({
      uploadId,
      userId: req.user.id,
      lemmas: words,
      finalize: finalize !== false
    });
    res.json({ words: created });
  } catch (error) {
    next(error);
  }
});

router.post('/image/cancel', async (req, res, next) => {
  try {
    const { uploadId } = req.body || {};
    if (!uploadId) {
      return res.status(400).json({ error: 'uploadId is required' });
    }
    const cancelled = discardImagePreview({ uploadId, userId: req.user.id });
    res.json({ cancelled });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { word, words = [] } = req.body;
    const inputs = Array.isArray(words) && words.length ? words : [word];
    const lemmas = inputs
      .flatMap((value) =>
        typeof value === 'string' ? value.split(/[\s,，]+/g) : []
      )
      .filter(Boolean);
    if (!lemmas.length) {
      return res.status(400).json({ error: 'At least one word is required' });
    }
    const created = await ingestWordsManually({ userId: req.user.id, lemmas });
    res.status(201).json({ words: created });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/metadata', async (req, res, next) => {
  try {
    const { lang } = req.query;
    const { id } = req.params;
    if (lang === 'zh') {
      const wordId = Number(id);
      if (Number.isNaN(wordId)) {
        return res.status(400).json({ error: 'Invalid word id' });
      }
      const owned = getWordWithMetadata(wordId, req.user.id);
      if (!owned) {
        return res.status(404).json({ error: 'Word not found' });
      }
      const meta = await ensureChineseSupplement(wordId);
      return res.json({
        enDefinition: meta.en_definition,
        enExample: meta.en_example,
        zhDefinition: meta.zh_definition,
        zhExample: meta.zh_example
      });
    }
    const wordId = Number(id);
    if (Number.isNaN(wordId)) {
      return res.status(400).json({ error: 'Invalid word id' });
    }
    const data = getWordWithMetadata(wordId, req.user.id);
    if (!data) {
      return res.status(404).json({ error: 'Word not found' });
    }
    res.json({
      enDefinition: data.enDefinition,
      enExample: data.enExample,
      zhDefinition: data.zhDefinition,
      zhExample: data.zhExample
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/regenerate', async (req, res, next) => {
  try {
    const wordId = Number(req.params.id);
    if (Number.isNaN(wordId)) {
      return res.status(400).json({ error: 'Invalid word id' });
    }
    const word = await regenerateWordResources({ userId: req.user.id, wordId });
    res.json({ word });
  } catch (error) {
    next(error);
  }
});

export default router;
