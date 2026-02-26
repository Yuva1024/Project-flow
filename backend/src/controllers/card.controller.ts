import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// --- Validation Schemas ---
const createCardSchema = z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(5000).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    dueDate: z.string().datetime().optional(),
    position: z.number().optional(),
});

const updateCardSchema = z.object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).nullable().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    listId: z.string().uuid().optional(),
    position: z.number().optional(),
});

// --- Helper: Verify board access via list ---
async function assertListAccess(workspaceId: string, boardId: string, listId: string, userId: string) {
    const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) return null;

    const list = await prisma.list.findFirst({
        where: { id: listId, board: { id: boardId, workspaceId } },
    });
    return list;
}

// --- Controllers ---

/**
 * POST /api/workspaces/:workspaceId/boards/:boardId/lists/:listId/cards
 * Creates a new card in a list. Auto-assigns position if not provided.
 */
export const createCard = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createCardSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const listId = req.params.listId as string;

        const list = await assertListAccess(workspaceId, boardId, listId, userId);
        if (!list) {
            return res.status(404).json({ message: 'List not found or access denied' });
        }

        // Auto-calculate position if not provided
        let position = parsed.data.position;
        if (position === undefined) {
            const lastCard = await prisma.card.findFirst({
                where: { listId },
                orderBy: { position: 'desc' },
            });
            position = lastCard ? lastCard.position + 1024 : 1024;
        }

        const card = await prisma.card.create({
            data: {
                title: parsed.data.title,
                description: parsed.data.description,
                priority: parsed.data.priority,
                position,
                listId,
                createdBy: userId,
            },
        });

        res.status(201).json(card);
    } catch (error) {
        console.error('Create card error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/workspaces/:workspaceId/boards/:boardId/lists/:listId/cards
 * Returns all cards for a list, ordered by position.
 */
export const getCards = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const listId = req.params.listId as string;

        const list = await assertListAccess(workspaceId, boardId, listId, userId);
        if (!list) {
            return res.status(404).json({ message: 'List not found or access denied' });
        }

        const cards = await prisma.card.findMany({
            where: { listId },
            orderBy: { position: 'asc' },
            include: {
                creator: { select: { id: true, name: true, email: true } },
            },
        });

        res.json(cards);
    } catch (error) {
        console.error('Get cards error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/workspaces/:workspaceId/boards/:boardId/cards/:cardId
 * Returns a single card with full details.
 */
export const getCardById = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;

        // Verify workspace membership
        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        const card = await prisma.card.findFirst({
            where: {
                id: cardId,
                list: { board: { id: boardId, workspaceId } },
            },
            include: {
                creator: { select: { id: true, name: true, email: true } },
                list: { select: { id: true, title: true } },
            },
        });

        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        res.json(card);
    } catch (error) {
        console.error('Get card error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/workspaces/:workspaceId/boards/:boardId/cards/:cardId
 * Updates a card's properties. Supports moving to a different list via listId.
 */
export const updateCard = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateCardSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;

        // Verify workspace membership
        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        // Verify card belongs to this board
        const card = await prisma.card.findFirst({
            where: {
                id: cardId,
                list: { board: { id: boardId, workspaceId } },
            },
        });
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        // If moving to a different list, verify the target list belongs to the same board
        if (parsed.data.listId && parsed.data.listId !== card.listId) {
            const targetList = await prisma.list.findFirst({
                where: { id: parsed.data.listId, boardId },
            });
            if (!targetList) {
                return res.status(400).json({ message: 'Target list not found on this board' });
            }
        }

        const updateData: any = { ...parsed.data };
        if (parsed.data.dueDate !== undefined) {
            updateData.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
        }

        const updated = await prisma.card.update({
            where: { id: cardId },
            data: updateData,
            include: {
                creator: { select: { id: true, name: true, email: true } },
                list: { select: { id: true, title: true } },
            },
        });

        res.json(updated);
    } catch (error) {
        console.error('Update card error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/workspaces/:workspaceId/boards/:boardId/cards/:cardId
 * Deletes a card.
 */
export const deleteCard = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;

        // Verify workspace membership
        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        const card = await prisma.card.findFirst({
            where: {
                id: cardId,
                list: { board: { id: boardId, workspaceId } },
            },
        });
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        await prisma.card.delete({ where: { id: cardId } });

        res.json({ message: 'Card deleted successfully' });
    } catch (error) {
        console.error('Delete card error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
