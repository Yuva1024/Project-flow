import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/activity.helper';
import { assertBoardAccess, assertCardAccess, assertLabelAccess } from '../utils/access';

// --- Validation Schemas ---
const createLabelSchema = z.object({
    name: z.string().min(1).max(50),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});

const updateLabelSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

const assignLabelSchema = z.object({
    labelId: z.string().uuid(),
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

        const access = await assertBoardAccess(workspaceId, boardId, userId);
        if (!access) return res.status(404).json({ message: 'Board not found or access denied' });

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

        const access = await assertBoardAccess(workspaceId, boardId, userId);
        if (!access) return res.status(404).json({ message: 'Board not found or access denied' });

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

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const labelId = req.params.labelId as string;

        const access = await assertLabelAccess(workspaceId, boardId, labelId, userId);
        if (!access) return res.status(404).json({ message: 'Label not found or access denied' });

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
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const labelId = req.params.labelId as string;

        const access = await assertLabelAccess(workspaceId, boardId, labelId, userId);
        if (!access) return res.status(404).json({ message: 'Label not found or access denied' });

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
        const parsed = assignLabelSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'labelId is required' });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;
        const { labelId } = parsed.data;

        const cardAccess = await assertCardAccess(workspaceId, boardId, cardId, userId);
        if (!cardAccess) return res.status(404).json({ message: 'Card not found or access denied' });

        // The label must live on the same board as the card — otherwise a label
        // from another board (or another workspace) could be stuck onto this card.
        const labelAccess = await assertLabelAccess(workspaceId, boardId, labelId, userId);
        if (!labelAccess) return res.status(404).json({ message: 'Label not found on this board' });

        const existing = await prisma.cardLabel.findUnique({
            where: { cardId_labelId: { cardId, labelId } },
        });
        if (existing) return res.status(409).json({ message: 'Label already assigned' });

        const cardLabel = await prisma.cardLabel.create({
            data: { cardId, labelId },
            include: { label: true },
        });

        await logActivity(cardId, userId, 'assigned label', cardLabel.label.name);

        res.status(201).json(cardLabel);
    } catch (error) {
        console.error('Assign label error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** DELETE /:boardId/cards/:cardId/labels/:labelId — Remove label from card */
export const removeLabel = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;
        const labelId = req.params.labelId as string;

        const cardAccess = await assertCardAccess(workspaceId, boardId, cardId, userId);
        if (!cardAccess) return res.status(404).json({ message: 'Card not found or access denied' });

        const labelAccess = await assertLabelAccess(workspaceId, boardId, labelId, userId);
        if (!labelAccess) return res.status(404).json({ message: 'Label not found on this board' });

        const existing = await prisma.cardLabel.findUnique({
            where: { cardId_labelId: { cardId, labelId } },
        });
        if (!existing) return res.status(404).json({ message: 'Label is not assigned to this card' });

        await prisma.cardLabel.delete({
            where: { cardId_labelId: { cardId, labelId } },
        });

        await logActivity(cardId, userId, 'removed label', labelAccess.label.name);

        res.json({ message: 'Label removed from card' });
    } catch (error) {
        console.error('Remove label error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
