import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
    getNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
} from '../controllers/notification.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllAsRead);
router.patch('/:id/read', markAsRead);

export default router;
