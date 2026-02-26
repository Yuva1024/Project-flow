import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// --- Controllers ---

/** GET /api/notifications — Get all notifications for the current user */
export const getNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;

        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        res.json(notifications);
    } catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** PATCH /api/notifications/:id/read — Mark a notification as read */
export const markAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const id = req.params.id as string;

        const notification = await prisma.notification.findFirst({ where: { id, userId } });
        if (!notification) return res.status(404).json({ message: 'Notification not found' });

        const updated = await prisma.notification.update({
            where: { id },
            data: { isRead: true },
        });

        res.json(updated);
    } catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** PATCH /api/notifications/read-all — Mark all notifications as read */
export const markAllAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;

        await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** GET /api/notifications/unread-count — Get count of unread notifications */
export const getUnreadCount = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;

        const count = await prisma.notification.count({
            where: { userId, isRead: false },
        });

        res.json({ count });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
