import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/activity.helper';

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

        const cardId = req.params.cardId as string;

        const checklist = await prisma.checklist.create({
            data: { title: parsed.data.title, cardId },
            include: { items: true },
        });

        const userId = req.user!.userId;
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
        const cardId = req.params.cardId as string;

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
        const checklistId = req.params.checklistId as string;

        await prisma.checklist.delete({ where: { id: checklistId } });
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

        const checklistId = req.params.checklistId as string;

        const updated = await prisma.checklist.update({
            where: { id: checklistId },
            data: parsed.data,
            include: { items: true },
        });

        const userId = req.user!.userId;
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

        const checklistId = req.params.checklistId as string;

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

        const itemId = req.params.itemId as string;

        const item = await prisma.checklistItem.findUnique({
            where: { id: itemId },
            include: { checklist: true }
        });
        if (!item) return res.status(404).json({ message: 'Item not found' });

        const updated = await prisma.checklistItem.update({
            where: { id: itemId },
            data: parsed.data,
        });

        const userId = req.user!.userId;
        if (parsed.data.isChecked !== undefined) {
            await logActivity(item.checklist.cardId, userId, parsed.data.isChecked ? 'completed checklist item' : 'uncompleted checklist item', item.content);
        } else if (parsed.data.content !== undefined) {
            await logActivity(item.checklist.cardId, userId, 'edited checklist item', parsed.data.content);
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
        const itemId = req.params.itemId as string;

        await prisma.checklistItem.delete({ where: { id: itemId } });
        res.json({ message: 'Item deleted' });
    } catch (error) {
        console.error('Delete checklist item error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
