import { prisma } from './prisma';

export const logActivity = async (cardId: string, userId: string, action: string, details?: string) => {
    try {
        await prisma.activityLog.create({
            data: {
                cardId,
                userId,
                action,
                details,
            },
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
};
