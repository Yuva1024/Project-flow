import { Router } from 'express';
import { register, login, getMe, updateProfile, changePassword, recoverAccount } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/recover-account', recoverAccount);
router.get('/me', requireAuth, getMe);
router.patch('/profile', requireAuth, updateProfile);
router.patch('/password', requireAuth, changePassword);

export default router;

