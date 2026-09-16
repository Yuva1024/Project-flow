import { prisma } from './prisma';

export const createNotification = async (userId: string, type: string, referenceId: string, message: string) => {
    try {
        await prisma.notification.create({
            data: {
                userId,
                type,
                referenceId,
                message,
            },
        });
    } catch (error) {
        console.error('Failed to create notification:', error);
    }
};

export const createNotifications = async (items: { userId: string; type: string; referenceId: string; message: string }[]) => {
    if (items.length === 0) return;
    try {
        await prisma.notification.createMany({ data: items });
    } catch (error) {
        console.error('Failed to create notifications:', error);
    }
};
