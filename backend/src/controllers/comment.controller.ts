import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// --- Validation Schemas ---
const createCommentSchema = z.object({
    content: z.string().min(1).max(5000),
});

const updateCommentSchema = z.object({
    content: z.string().min(1).max(5000),
});

// --- Controllers ---

/**
 * POST /api/workspaces/:workspaceId/boards/:boardId/cards/:cardId/comments
 * Adds a comment to a card.
 */
export const createComment = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createCommentSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;

        // Verify membership
        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        // Verify card belongs to this board
        const card = await prisma.card.findFirst({
            where: { id: cardId, list: { board: { id: boardId, workspaceId } } },
        });
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        const comment = await prisma.comment.create({
            data: {
                content: parsed.data.content,
                cardId,
                userId,
            },
            include: {
                user: { select: { id: true, name: true, email: true, avatarUrl: true } },
            },
        });

        res.status(201).json(comment);
    } catch (error) {
        console.error('Create comment error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/workspaces/:workspaceId/boards/:boardId/cards/:cardId/comments
 * Returns all comments for a card, ordered newest first.
 */
export const getComments = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;

        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        const card = await prisma.card.findFirst({
            where: { id: cardId, list: { board: { id: boardId, workspaceId } } },
        });
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        const comments = await prisma.comment.findMany({
            where: { cardId },
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { id: true, name: true, email: true, avatarUrl: true } },
            },
        });

        res.json(comments);
    } catch (error) {
        console.error('Get comments error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/workspaces/:workspaceId/boards/:boardId/cards/:cardId/comments/:commentId
 * Updates a comment. Only the author can edit.
 */
export const updateComment = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateCommentSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const commentId = req.params.commentId as string;

        const comment = await prisma.comment.findUnique({ where: { id: commentId } });
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        if (comment.userId !== userId) {
            return res.status(403).json({ message: 'You can only edit your own comments' });
        }

        const updated = await prisma.comment.update({
            where: { id: commentId },
            data: { content: parsed.data.content },
            include: {
                user: { select: { id: true, name: true, email: true, avatarUrl: true } },
            },
        });

        res.json(updated);
    } catch (error) {
        console.error('Update comment error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/workspaces/:workspaceId/boards/:boardId/cards/:cardId/comments/:commentId
 * Deletes a comment. Author or workspace ADMINs can delete.
 */
export const deleteComment = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const commentId = req.params.commentId as string;

        const comment = await prisma.comment.findUnique({ where: { id: commentId } });
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }

        // Allow deletion by author or workspace admin
        if (comment.userId !== userId) {
            const membership = await prisma.workspaceMember.findUnique({
                where: { workspaceId_userId: { workspaceId, userId } },
            });
            if (!membership || membership.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Only the author or an admin can delete comments' });
            }
        }

        await prisma.comment.delete({ where: { id: commentId } });

        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Delete comment error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
