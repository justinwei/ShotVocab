import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  assertValidPassword,
  createUser,
  getUserByEmail,
  normalizeEmail,
  serializeUser,
  verifyPassword
} from '../services/userService.js';
import { createAuthToken } from '../services/authService.js';

const router = Router();

router.post('/register', (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password?.toString() ?? '';
    assertValidPassword(password);
    const user = createUser({ email, password });
    const token = createAuthToken({ userId: user.id });
    res.status(201).json({
      token,
      user
    });
  } catch (error) {
    if (error.message === 'Email is already registered') {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.post('/login', (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password?.toString() ?? '';
    const user = getUserByEmail(email);
    if (!user || !verifyPassword({ password, passwordHash: user.password_hash })) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = createAuthToken({ userId: user.id });
    res.json({
      token,
      user: serializeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
