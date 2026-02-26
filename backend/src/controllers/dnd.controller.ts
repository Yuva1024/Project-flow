import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

// --- Validation Schemas ---
const reorderListsSchema = z.object({
    orderedListIds: z.array(z.string().uuid()),
});

const reorderCardsSchema = z.object({
    cardId: z.string().uuid(),
    targetListId: z.string().uuid(),
    targetIndex: z.number().int().min(0),
});

// --- Controllers ---

/**
 * PUT /api/workspaces/:workspaceId/boards/:boardId/lists/reorder
 * Batch reorders all lists on a board by receiving an ordered array of list IDs.
 * Assigns new positions using increments of 1024.
 */
export const reorderLists = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = reorderListsSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;

        // Verify membership
        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        // Verify board exists
        const board = await prisma.board.findFirst({ where: { id: boardId, workspaceId } });
        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const { orderedListIds } = parsed.data;

        // Batch update in a transaction
        await prisma.$transaction(
            orderedListIds.map((listId, index) =>
                prisma.list.update({
                    where: { id: listId },
                    data: { position: (index + 1) * 1024 },
                })
            )
        );

        // Return the newly ordered lists
        const lists = await prisma.list.findMany({
            where: { boardId },
            orderBy: { position: 'asc' },
            include: {
                cards: { orderBy: { position: 'asc' } },
            },
        });

        res.json(lists);
    } catch (error) {
        console.error('Reorder lists error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * PUT /api/workspaces/:workspaceId/boards/:boardId/cards/reorder
 * Moves a card to a target list at a target index.
 * Recalculates positions using midpoint math for the target list.
 */
export const reorderCards = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = reorderCardsSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;

        // Verify membership
        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        const { cardId, targetListId, targetIndex } = parsed.data;

        // Verify the card belongs to this board
        const card = await prisma.card.findFirst({
            where: { id: cardId, list: { board: { id: boardId, workspaceId } } },
        });
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        // Verify target list belongs to this board
        const targetList = await prisma.list.findFirst({
            where: { id: targetListId, boardId },
        });
        if (!targetList) {
            return res.status(404).json({ message: 'Target list not found' });
        }

        // Get all cards in the target list (excluding the card being moved if same list)
        const targetCards = await prisma.card.findMany({
            where: {
                listId: targetListId,
                id: { not: cardId },
            },
            orderBy: { position: 'asc' },
        });

        // Calculate the new position using midpoint math
        let newPosition: number;

        if (targetCards.length === 0) {
            // Empty list — place at 1024
            newPosition = 1024;
        } else if (targetIndex === 0) {
            // Place before the first card
            newPosition = targetCards[0].position / 2;
        } else if (targetIndex >= targetCards.length) {
            // Place after the last card
            newPosition = targetCards[targetCards.length - 1].position + 1024;
        } else {
            // Place between two cards
            const before = targetCards[targetIndex - 1].position;
            const after = targetCards[targetIndex].position;
            newPosition = (before + after) / 2;
        }

        // Check if positions have become too close (< 0.001) — normalize if so
        const needsNormalization = targetCards.some((c, i) => {
            if (i === 0) return false;
            return c.position - targetCards[i - 1].position < 0.001;
        });

        if (needsNormalization) {
            // Re-assign all positions cleanly in a transaction
            const allCards = [...targetCards];
            allCards.splice(targetIndex, 0, { ...card, position: 0 } as any);

            await prisma.$transaction(
                allCards.map((c, index) =>
                    prisma.card.update({
                        where: { id: c.id },
                        data: {
                            position: (index + 1) * 1024,
                            listId: targetListId,
                        },
                    })
                )
            );
        } else {
            // Simple single update
            await prisma.card.update({
                where: { id: cardId },
                data: {
                    position: newPosition,
                    listId: targetListId,
                },
            });
        }

        // Return the updated board state
        const lists = await prisma.list.findMany({
            where: { boardId },
            orderBy: { position: 'asc' },
            include: {
                cards: { orderBy: { position: 'asc' } },
            },
        });

        res.json(lists);
    } catch (error) {
        console.error('Reorder cards error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
