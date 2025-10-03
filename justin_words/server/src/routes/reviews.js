import { Router } from 'express';
import { ensureDefaultUser } from '../services/userService.js';
import { fetchDueReviews, recordReviewResult } from '../services/schedulerService.js';
import { ensureChineseSupplement } from '../services/wordService.js';

const router = Router();

router.get('/today', (req, res, next) => {
  try {
    const user = ensureDefaultUser();
    const limit = Number(req.query.limit || 20);
    const reviews = fetchDueReviews({ userId: user.id, limit });
    res.json({ reviews });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/response', async (req, res, next) => {
  try {
    const { rating } = req.body;
    const scheduling = recordReviewResult({ reviewId: Number(req.params.id), rating });

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
