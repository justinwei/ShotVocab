import { Router } from 'express';
import { summarizeDailyStats } from '../services/schedulerService.js';

const router = Router();

router.get('/daily', (req, res, next) => {
  try {
    const end = req.query.end || new Date().toISOString().slice(0, 10);
    const start = req.query.start || new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const stats = summarizeDailyStats({ userId: req.user.id, start, end });
    res.json({ stats });
  } catch (error) {
    next(error);
  }
});

export default router;
