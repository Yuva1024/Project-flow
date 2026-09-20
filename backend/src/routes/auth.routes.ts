import { Router } from 'express';
import { register, login, getMe, updateProfile, changePassword, recoverAccount } from '../controllers/auth.controller';
import { requireAuth, requireSession } from '../middleware/auth.middleware';
import { createAccessToken, listAccessTokens, revokeAccessToken } from '../controllers/token.controller';
import { authLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/recover-account', authLimiter, recoverAccount);
router.get('/me', requireAuth, getMe);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/password', authLimiter, requireAuth, changePassword);

// Personal access tokens (Blender addon and other non-browser clients).
// requireSession blocks PATs here: a leaked token must not be able to mint
// replacements for itself and outlive its own revocation.
router.post('/tokens', requireAuth, requireSession, createAccessToken);
router.get('/tokens', requireAuth, requireSession, listAccessTokens);
router.delete('/tokens/:tokenId', requireAuth, requireSession, revokeAccessToken);

export default router;
