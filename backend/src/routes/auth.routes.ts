import { Router } from 'express';
import { register, login, getMe, updateProfile, changePassword, recoverAccount } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { authLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/recover-account', authLimiter, recoverAccount);
router.get('/me', requireAuth, getMe);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/password', authLimiter, requireAuth, changePassword);

export default router;
