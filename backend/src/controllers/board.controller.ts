import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// --- Validation Schemas ---
const createBoardSchema = z.object({
    title: z.string().min(1).max(200),
    visibility: z.enum(['PRIVATE', 'WORKSPACE']).optional().default('WORKSPACE'),
});

const updateBoardSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    visibility: z.enum(['PRIVATE', 'WORKSPACE']).optional(),
});

// --- Helper: Check workspace membership ---
async function assertWorkspaceMember(workspaceId: string, userId: string) {
    const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
    });
    return membership;
}

// --- Controllers ---

/**
 * POST /api/workspaces/:workspaceId/boards
 * Creates a new board inside a workspace.
 */
export const createBoard = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createBoardSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;

        const membership = await assertWorkspaceMember(workspaceId, userId);
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        const board = await prisma.board.create({
            data: {
                title: parsed.data.title,
                visibility: parsed.data.visibility,
                workspaceId,
            },
        });

        res.status(201).json(board);
    } catch (error) {
        console.error('Create board error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/workspaces/:workspaceId/boards
 * Lists all boards in a workspace the user can see.
 */
export const getBoards = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;

        const membership = await assertWorkspaceMember(workspaceId, userId);
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        const boards = await prisma.board.findMany({
            where: { workspaceId },
            include: {
                _count: { select: { lists: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(boards);
    } catch (error) {
        console.error('Get boards error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/workspaces/:workspaceId/boards/:boardId
 * Returns a single board with its lists and cards.
 */
export const getBoardById = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;

        const membership = await assertWorkspaceMember(workspaceId, userId);
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        const board = await prisma.board.findFirst({
            where: { id: boardId, workspaceId },
            include: {
                lists: {
                    orderBy: { position: 'asc' },
                    include: {
                        cards: {
                            orderBy: { position: 'asc' },
                        },
                    },
                },
            },
        });

        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        res.json(board);
    } catch (error) {
        console.error('Get board error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/workspaces/:workspaceId/boards/:boardId
 * Updates a board's title or visibility.
 */
export const updateBoard = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateBoardSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;

        const membership = await assertWorkspaceMember(workspaceId, userId);
        if (!membership) {
            return res.status(403).json({ message: 'Not a member of this workspace' });
        }

        const board = await prisma.board.findFirst({ where: { id: boardId, workspaceId } });
        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        const updated = await prisma.board.update({
            where: { id: boardId },
            data: parsed.data,
        });

        res.json(updated);
    } catch (error) {
        console.error('Update board error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/workspaces/:workspaceId/boards/:boardId
 * Deletes a board. Only ADMINs can delete.
 */
export const deleteBoard = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;

        const membership = await assertWorkspaceMember(workspaceId, userId);
        if (!membership || membership.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Only admins can delete boards' });
        }

        const board = await prisma.board.findFirst({ where: { id: boardId, workspaceId } });
        if (!board) {
            return res.status(404).json({ message: 'Board not found' });
        }

        await prisma.board.delete({ where: { id: boardId } });

        res.json({ message: 'Board deleted successfully' });
    } catch (error) {
        console.error('Delete board error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
