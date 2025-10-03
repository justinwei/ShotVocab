import { Router } from 'express';
import {
  uploadMiddleware,
  ingestWordFromImage,
  ingestWordManually,
  ensureChineseSupplement,
  getWordWithMetadata,
  listWordsWithMetadata,
  ensureWordAudioUrl,
  ensureDefinitionAudioUrl,
  ensureExampleAudioUrl
} from '../services/wordService.js';
import { ensureDefaultUser } from '../services/userService.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const user = ensureDefaultUser();
    const limit = Number(req.query.limit || 500);
    const words = listWordsWithMetadata({ userId: user.id, limit });
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
      url = await ensureWordAudioUrl(wordId);
    } else if (target === 'enDefinition') {
      url = await ensureDefinitionAudioUrl(wordId);
    } else if (target === 'enExample') {
      url = await ensureExampleAudioUrl(wordId);
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
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
    const result = await ingestWordFromImage({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype
    });
    const words = result.words || [];
    console.info('[words:image] ingest success', {
      count: words.length,
      lemmas: words.map((item) => item.lemma)
    });
    res.json({
      words
    });
  } catch (error) {
    console.error('[words:image] ingest failed', error);
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { word } = req.body;
    const created = await ingestWordManually({ lemma: word });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

router.get('/:id/metadata', async (req, res, next) => {
  try {
    const { lang } = req.query;
    const { id } = req.params;
    if (lang === 'zh') {
      const meta = await ensureChineseSupplement(Number(id));
      return res.json({
        enDefinition: meta.en_definition,
        enExample: meta.en_example,
        zhDefinition: meta.zh_definition,
        zhExample: meta.zh_example
      });
    }
    const data = getWordWithMetadata(Number(id));
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

export default router;
