import { Router } from 'express';
import { fetchDueReviews, recordReviewResult } from '../services/schedulerService.js';
import { ensureChineseSupplement } from '../services/wordService.js';

const router = Router();

router.get('/today', (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 20);
    const reviews = fetchDueReviews({ userId: req.user.id, limit });
    res.json({ reviews });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/response', async (req, res, next) => {
  try {
    const { rating } = req.body;
    const reviewId = Number(req.params.id);
    if (Number.isNaN(reviewId)) {
      return res.status(400).json({ error: 'Invalid review id' });
    }
    const scheduling = recordReviewResult({ reviewId, rating, userId: req.user.id });

    let zhSupplement = null;
    if (scheduling.rating === 'unfamiliar') {
      const meta = await ensureChineseSupplement(scheduling.wordId);
      zhSupplement = {
        definition: meta.zh_definition,
        example: meta.zh_example
      };
    }

    res.json({ scheduling, zhSupplement });
  } catch (error) {
    next(error);
  }
});

export default router;
