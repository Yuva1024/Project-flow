import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// --- Validation Schemas ---
const createListSchema = z.object({
    title: z.string().min(1).max(200),
    position: z.number().optional(),
});

const updateListSchema = z.object({
    title: z.string().min(1).max(200).optional(),
});

// --- Helper: Verify board access ---
async function assertBoardAccess(workspaceId: string, boardId: string, userId: string) {
    const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) return null;

    const board = await prisma.board.findFirst({
        where: { id: boardId, workspaceId },
    });
    return board;
}

// --- Controllers ---

/**
 * POST /api/workspaces/:workspaceId/boards/:boardId/lists
 * Creates a new list on a board. Auto-assigns position if not provided.
 */
export const createList = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createListSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;

        const board = await assertBoardAccess(workspaceId, boardId, userId);
        if (!board) {
            return res.status(404).json({ message: 'Board not found or access denied' });
        }

        // Auto-calculate position if not provided
        let position = parsed.data.position;
        if (position === undefined) {
            const lastList = await prisma.list.findFirst({
                where: { boardId },
                orderBy: { position: 'desc' },
            });
            position = lastList ? lastList.position + 1024 : 1024;
        }

        const list = await prisma.list.create({
            data: {
                title: parsed.data.title,
                position,
                boardId,
            },
        });

        res.status(201).json(list);
    } catch (error) {
        console.error('Create list error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/workspaces/:workspaceId/boards/:boardId/lists
 * Returns all lists for a board, ordered by position.
 */
export const getLists = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;

        const board = await assertBoardAccess(workspaceId, boardId, userId);
        if (!board) {
            return res.status(404).json({ message: 'Board not found or access denied' });
        }

        const lists = await prisma.list.findMany({
            where: { boardId },
            orderBy: { position: 'asc' },
            include: {
                cards: {
                    orderBy: { position: 'asc' },
                },
                _count: { select: { cards: true } },
            },
        });

        res.json(lists);
    } catch (error) {
        console.error('Get lists error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/workspaces/:workspaceId/boards/:boardId/lists/:listId
 * Updates a list's title.
 */
export const updateList = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateListSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const listId = req.params.listId as string;

        const board = await assertBoardAccess(workspaceId, boardId, userId);
        if (!board) {
            return res.status(404).json({ message: 'Board not found or access denied' });
        }

        const list = await prisma.list.findFirst({ where: { id: listId, boardId } });
        if (!list) {
            return res.status(404).json({ message: 'List not found' });
        }

        const updated = await prisma.list.update({
            where: { id: listId },
            data: parsed.data,
        });

        res.json(updated);
    } catch (error) {
        console.error('Update list error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/workspaces/:workspaceId/boards/:boardId/lists/:listId
 * Deletes a list and all its cards (cascade via schema).
 */
export const deleteList = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const listId = req.params.listId as string;

        const board = await assertBoardAccess(workspaceId, boardId, userId);
        if (!board) {
            return res.status(404).json({ message: 'Board not found or access denied' });
        }

        const list = await prisma.list.findFirst({ where: { id: listId, boardId } });
        if (!list) {
            return res.status(404).json({ message: 'List not found' });
        }

        await prisma.list.delete({ where: { id: listId } });

        res.json({ message: 'List deleted successfully' });
    } catch (error) {
        console.error('Delete list error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
