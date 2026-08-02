import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
    requireAdmin,
    getAdminStats,
    getAdminUsers,
    deleteUser,
    getSystemLogs,
} from '../controllers/admin.controller';

const router = Router();

// All admin routes require authentication + admin check
router.use(requireAuth);
router.use(requireAdmin as any);

// Admin endpoints
router.get('/stats', getAdminStats);
router.get('/users', getAdminUsers);
router.delete('/users/:userId', deleteUser);
router.get('/logs', getSystemLogs);

export default router;
