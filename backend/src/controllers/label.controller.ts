import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// --- Validation Schemas ---
const createLabelSchema = z.object({
    name: z.string().min(1).max(50),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

const updateLabelSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

// --- Controllers ---

/** POST /:boardId/labels — Create a label on a board */
export const createLabel = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createLabelSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;

        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!membership) return res.status(403).json({ message: 'Access denied' });

        const board = await prisma.board.findFirst({ where: { id: boardId, workspaceId } });
        if (!board) return res.status(404).json({ message: 'Board not found' });

        const label = await prisma.label.create({
            data: { name: parsed.data.name, color: parsed.data.color, boardId },
        });

        res.status(201).json(label);
    } catch (error) {
        console.error('Create label error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** GET /:boardId/labels — List all labels on a board */
export const getLabels = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;

        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });
        if (!membership) return res.status(403).json({ message: 'Access denied' });

        const labels = await prisma.label.findMany({
            where: { boardId },
            include: { _count: { select: { cards: true } } },
        });

        res.json(labels);
    } catch (error) {
        console.error('Get labels error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** PATCH /:boardId/labels/:labelId — Update label */
export const updateLabel = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateLabelSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const labelId = req.params.labelId as string;
        const label = await prisma.label.findUnique({ where: { id: labelId } });
        if (!label) return res.status(404).json({ message: 'Label not found' });

        const updated = await prisma.label.update({ where: { id: labelId }, data: parsed.data });
        res.json(updated);
    } catch (error) {
        console.error('Update label error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** DELETE /:boardId/labels/:labelId — Delete label */
export const deleteLabel = async (req: AuthRequest, res: Response) => {
    try {
        const labelId = req.params.labelId as string;
        const label = await prisma.label.findUnique({ where: { id: labelId } });
        if (!label) return res.status(404).json({ message: 'Label not found' });

        await prisma.label.delete({ where: { id: labelId } });
        res.json({ message: 'Label deleted' });
    } catch (error) {
        console.error('Delete label error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** POST /:boardId/cards/:cardId/labels — Assign label to card */
export const assignLabel = async (req: AuthRequest, res: Response) => {
    try {
        const cardId = req.params.cardId as string;
        const { labelId } = req.body;

        if (!labelId) return res.status(400).json({ message: 'labelId is required' });

        const existing = await prisma.cardLabel.findUnique({
            where: { cardId_labelId: { cardId, labelId } },
        });
        if (existing) return res.status(400).json({ message: 'Label already assigned' });

        const cardLabel = await prisma.cardLabel.create({
            data: { cardId, labelId },
            include: { label: true },
        });

        res.status(201).json(cardLabel);
    } catch (error) {
        console.error('Assign label error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** DELETE /:boardId/cards/:cardId/labels/:labelId — Remove label from card */
export const removeLabel = async (req: AuthRequest, res: Response) => {
    try {
        const cardId = req.params.cardId as string;
        const labelId = req.params.labelId as string;

        await prisma.cardLabel.delete({
            where: { cardId_labelId: { cardId, labelId } },
        });

        res.json({ message: 'Label removed from card' });
    } catch (error) {
        console.error('Remove label error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
