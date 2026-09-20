import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/activity.helper';
import {
    assertCardAccess,
    assertChecklistAccess,
    assertChecklistItemAccess,
} from '../utils/access';

// --- Validation Schemas ---
const createChecklistSchema = z.object({
    title: z.string().min(1).max(200),
});

const createChecklistItemSchema = z.object({
    content: z.string().min(1).max(500),
});

const updateChecklistItemSchema = z.object({
    content: z.string().min(1).max(500).optional(),
    isChecked: z.boolean().optional(),
});

// --- Controllers ---

/** POST /:boardId/cards/:cardId/checklists — Create checklist on card */
export const createChecklist = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createChecklistSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;

        const access = await assertCardAccess(workspaceId, boardId, cardId, userId);
        if (!access) {
            return res.status(404).json({ message: 'Card not found or access denied' });
        }

        const checklist = await prisma.checklist.create({
            data: { title: parsed.data.title, cardId },
            include: { items: true },
        });

        await logActivity(cardId, userId, 'created checklist', checklist.title);

        res.status(201).json(checklist);
    } catch (error) {
        console.error('Create checklist error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** GET /:boardId/cards/:cardId/checklists — Get all checklists for a card */
export const getChecklists = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;

        const access = await assertCardAccess(workspaceId, boardId, cardId, userId);
        if (!access) {
            return res.status(404).json({ message: 'Card not found or access denied' });
        }

        const checklists = await prisma.checklist.findMany({
            where: { cardId },
            include: { items: true },
        });

        res.json(checklists);
    } catch (error) {
        console.error('Get checklists error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** DELETE /:boardId/cards/:cardId/checklists/:checklistId — Delete checklist */
export const deleteChecklist = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;
        const checklistId = req.params.checklistId as string;

        const access = await assertChecklistAccess(workspaceId, boardId, cardId, checklistId, userId);
        if (!access) {
            return res.status(404).json({ message: 'Checklist not found or access denied' });
        }

        await prisma.checklist.delete({ where: { id: checklistId } });

        await logActivity(cardId, userId, 'deleted checklist', access.checklist.title);

        res.json({ message: 'Checklist deleted' });
    } catch (error) {
        console.error('Delete checklist error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

const updateChecklistSchema = z.object({
    title: z.string().min(1).max(200),
});

/** PATCH /:boardId/cards/:cardId/checklists/:checklistId — Update checklist title */
export const updateChecklist = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateChecklistSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;
        const checklistId = req.params.checklistId as string;

        const access = await assertChecklistAccess(workspaceId, boardId, cardId, checklistId, userId);
        if (!access) {
            return res.status(404).json({ message: 'Checklist not found or access denied' });
        }

        const updated = await prisma.checklist.update({
            where: { id: checklistId },
            data: parsed.data,
            include: { items: true },
        });

        await logActivity(updated.cardId, userId, 'renamed checklist', updated.title);

        res.json(updated);
    } catch (error) {
        console.error('Update checklist error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};


/** POST /:boardId/cards/:cardId/checklists/:checklistId/items — Add item */
export const createChecklistItem = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createChecklistItemSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;
        const checklistId = req.params.checklistId as string;

        const access = await assertChecklistAccess(workspaceId, boardId, cardId, checklistId, userId);
        if (!access) {
            return res.status(404).json({ message: 'Checklist not found or access denied' });
        }

        const item = await prisma.checklistItem.create({
            data: { content: parsed.data.content, checklistId },
        });

        res.status(201).json(item);
    } catch (error) {
        console.error('Create checklist item error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** PATCH /.../items/:itemId — Update checklist item (toggle or edit) */
export const updateChecklistItem = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateChecklistItemSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;
        const checklistId = req.params.checklistId as string;
        const itemId = req.params.itemId as string;

        const access = await assertChecklistItemAccess(workspaceId, boardId, cardId, checklistId, itemId, userId);
        if (!access) {
            return res.status(404).json({ message: 'Item not found or access denied' });
        }

        const updated = await prisma.checklistItem.update({
            where: { id: itemId },
            data: parsed.data,
        });

        if (parsed.data.isChecked !== undefined) {
            await logActivity(cardId, userId, parsed.data.isChecked ? 'completed checklist item' : 'uncompleted checklist item', access.item.content);
        } else if (parsed.data.content !== undefined) {
            await logActivity(cardId, userId, 'edited checklist item', parsed.data.content);
        }

        res.json(updated);
    } catch (error) {
        console.error('Update checklist item error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/** DELETE /.../items/:itemId — Delete checklist item */
export const deleteChecklistItem = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.workspaceId as string;
        const boardId = req.params.boardId as string;
        const cardId = req.params.cardId as string;
        const checklistId = req.params.checklistId as string;
        const itemId = req.params.itemId as string;

        const access = await assertChecklistItemAccess(workspaceId, boardId, cardId, checklistId, itemId, userId);
        if (!access) {
            return res.status(404).json({ message: 'Item not found or access denied' });
        }

        await prisma.checklistItem.delete({ where: { id: itemId } });
        res.json({ message: 'Item deleted' });
    } catch (error) {
        console.error('Delete checklist item error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
