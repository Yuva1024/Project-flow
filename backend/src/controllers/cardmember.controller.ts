import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// --- Controllers ---

/** POST /:boardId/cards/:cardId/members — Assign member to card */
export const assignCardMember = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;
        const { userId: targetUserId } = req.body;

        if (!targetUserId) return res.status(400).json({ message: 'userId is required' });

        // Verify target user is a workspace member
        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
        });
        if (!membership) return res.status(400).json({ message: 'User is not a workspace member' });

        const existing = await prisma.cardMember.findUnique({
            where: { cardId_userId: { cardId, userId: targetUserId } },
        });
        if (existing) return res.status(400).json({ message: 'User already assigned' });

        const cardMember = await prisma.cardMember.create({
            data: { cardId, userId: targetUserId },
            include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        });

        res.status(201).json(cardMember);
    } catch (error) {
        console.error('Assign card member error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** GET /:boardId/cards/:cardId/members — Get card members */
export const getCardMembers = async (req: AuthRequest, res: Response) => {
    try {
        const cardId = req.params.cardId as string;

        const members = await prisma.cardMember.findMany({
            where: { cardId },
            include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        });

        res.json(members);
    } catch (error) {
        console.error('Get card members error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** DELETE /:boardId/cards/:cardId/members/:memberId — Remove member from card */
export const removeCardMember = async (req: AuthRequest, res: Response) => {
    try {
        const cardId = req.params.cardId as string;
        const memberId = req.params.memberId as string;

        await prisma.cardMember.delete({
            where: { cardId_userId: { cardId, userId: memberId } },
        });

        res.json({ message: 'Member removed from card' });
    } catch (error) {
        console.error('Remove card member error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** GET /:boardId/cards/:cardId/activity — Get activity log for a card */
export const getActivityLog = async (req: AuthRequest, res: Response) => {
    try {
        const cardId = req.params.cardId as string;

        const logs = await prisma.activityLog.findMany({
            where: { cardId },
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        });

        res.json(logs);
    } catch (error) {
        console.error('Get activity log error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
