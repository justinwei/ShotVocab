import { resolveUserFromToken } from '../services/authService.js';
import { serializeUser } from '../services/userService.js';

function extractToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (header && typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  if (req.headers['x-access-token']) {
    return req.headers['x-access-token'];
  }
  return null;
}

export function attachUser(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      req.user = null;
      return next();
    }
    const user = resolveUserFromToken(token);
    req.user = user ? serializeUser(user) : null;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  return next();
}
