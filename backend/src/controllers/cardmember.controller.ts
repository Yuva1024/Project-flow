import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/activity.helper';
import { createNotification } from '../utils/notification.helper';
import { assertCardAccess, getMembership } from '../utils/access';

const assignCardMemberSchema = z.object({
    userId: z.string().uuid(),
});

// --- Controllers ---

/** POST /:boardId/cards/:cardId/members — Assign member to card */
export const assignCardMember = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = assignCardMemberSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'userId is required' });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;
        const targetUserId = parsed.data.userId;

        // The requester must be able to reach this card...
        const access = await assertCardAccess(workspaceId, boardId, cardId, userId);
        if (!access) return res.status(404).json({ message: 'Card not found or access denied' });

        // ...and the person being assigned must belong to the same workspace.
        const targetMembership = await getMembership(workspaceId, targetUserId);
        if (!targetMembership) return res.status(400).json({ message: 'User is not a workspace member' });

        const existing = await prisma.cardMember.findUnique({
            where: { cardId_userId: { cardId, userId: targetUserId } },
        });
        if (existing) return res.status(409).json({ message: 'User already assigned' });

        const cardMember = await prisma.cardMember.create({
            data: { cardId, userId: targetUserId },
            include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
        });

        await logActivity(cardId, userId, 'assigned member', cardMember.user.name);

        if (userId !== targetUserId) {
            await createNotification(targetUserId, 'card_assignment', cardId, `You have been assigned to the card "${access.card.title}"`);
        }

        res.status(201).json(cardMember);
    } catch (error) {
        console.error('Assign card member error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** GET /:boardId/cards/:cardId/members — Get card members */
export const getCardMembers = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;

        const access = await assertCardAccess(workspaceId, boardId, cardId, userId);
        if (!access) return res.status(404).json({ message: 'Card not found or access denied' });

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
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;
        const memberId = req.params.memberId as string;

        const access = await assertCardAccess(workspaceId, boardId, cardId, userId);
        if (!access) return res.status(404).json({ message: 'Card not found or access denied' });

        const existing = await prisma.cardMember.findUnique({
            where: { cardId_userId: { cardId, userId: memberId } },
            include: { user: { select: { name: true } } },
        });
        if (!existing) return res.status(404).json({ message: 'Member is not assigned to this card' });

        await prisma.cardMember.delete({
            where: { cardId_userId: { cardId, userId: memberId } },
        });

        await logActivity(cardId, userId, 'removed member', existing.user.name);

        res.json({ message: 'Member removed from card' });
    } catch (error) {
        console.error('Remove card member error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** GET /:boardId/cards/:cardId/activity — Get activity log for a card */
export const getActivityLog = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;

        const access = await assertCardAccess(workspaceId, boardId, cardId, userId);
        if (!access) return res.status(404).json({ message: 'Card not found or access denied' });

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
