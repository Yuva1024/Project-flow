import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest, requireAuth } from '../middleware/auth.middleware';
import { uploadFile } from '../utils/s3';
import multer from 'multer';
import { uploadLimiter } from '../middleware/rateLimit.middleware';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const router = Router({ mergeParams: true });

router.use(requireAuth);

// Every handler below verifies workspace membership first
async function assertMember(workspaceId: string, userId: string) {
    return prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
    });
}

const createElementSchema = z.object({
    name: z.string().min(1).max(120),
});

const updateBoardSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    elements: z.array(z.any()).max(5000).optional(),
});

/** GET /api/workspaces/:workspaceId/whiteboards — list whiteboards */
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const membership = await assertMember(workspaceId, req.user!.userId);
        if (!membership) return res.status(403).json({ message: 'Not a member of this workspace' });

        const whiteboards = await prisma.whiteboard.findMany({
            where: { workspaceId },
            select: { id: true, name: true, createdAt: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(whiteboards);
    } catch (error) {
        console.error('List whiteboards error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/** POST /api/workspaces/:workspaceId/whiteboards — create */
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createElementSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });

        const workspaceId = req.params.workspaceId as string;
        const membership = await assertMember(workspaceId, req.user!.userId);
        if (!membership) return res.status(403).json({ message: 'Not a member of this workspace' });

        const whiteboard = await prisma.whiteboard.create({
            data: { name: parsed.data.name, workspaceId, elements: [] },
            select: { id: true, name: true, createdAt: true, updatedAt: true },
        });
        res.status(201).json(whiteboard);
    } catch (error) {
        console.error('Create whiteboard error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/** GET /:wbId — full whiteboard with elements */
router.get('/:wbId', async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const membership = await assertMember(workspaceId, req.user!.userId);
        if (!membership) return res.status(403).json({ message: 'Not a member of this workspace' });

        const whiteboard = await prisma.whiteboard.findFirst({
            where: { id: req.params.wbId as string, workspaceId },
        });
        if (!whiteboard) return res.status(404).json({ message: 'Whiteboard not found' });

        res.json(whiteboard);
    } catch (error) {
        console.error('Get whiteboard error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/** PATCH /:wbId — rename and/or save elements */
router.patch('/:wbId', async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateBoardSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });

        const workspaceId = req.params.workspaceId as string;
        const membership = await assertMember(workspaceId, req.user!.userId);
        if (!membership) return res.status(403).json({ message: 'Not a member of this workspace' });

        const existing = await prisma.whiteboard.findFirst({
            where: { id: req.params.wbId as string, workspaceId },
            select: { id: true },
        });
        if (!existing) return res.status(404).json({ message: 'Whiteboard not found' });

        const data: any = {};
        if (parsed.data.name !== undefined) data.name = parsed.data.name;
        if (parsed.data.elements !== undefined) data.elements = parsed.data.elements;

        const updated = await prisma.whiteboard.update({
            where: { id: existing.id },
            data,
            select: { id: true, name: true, updatedAt: true },
        });
        res.json(updated);
    } catch (error) {
        console.error('Update whiteboard error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/** DELETE /:wbId */
router.delete('/:wbId', async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const membership = await assertMember(workspaceId, req.user!.userId);
        if (!membership) return res.status(403).json({ message: 'Not a member of this workspace' });

        const existing = await prisma.whiteboard.findFirst({
            where: { id: req.params.wbId as string, workspaceId },
            select: { id: true },
        });
        if (!existing) return res.status(404).json({ message: 'Whiteboard not found' });

        await prisma.whiteboard.delete({ where: { id: existing.id } });
        res.json({ message: 'Whiteboard deleted' });
    } catch (error) {
        console.error('Delete whiteboard error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

/** POST /:wbId/assets — upload image to R2 for whiteboard */
router.post('/:wbId/assets', uploadLimiter, upload.single('file'), async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const file = req.file;
        const userId = req.user!.userId;

        if (!file) return res.status(400).json({ message: 'No file uploaded' });

        const membership = await assertMember(workspaceId, userId);
        if (!membership) return res.status(403).json({ message: 'Not a member of this workspace' });

        const existing = await prisma.whiteboard.findFirst({
            where: { id: req.params.wbId as string, workspaceId },
            select: { id: true },
        });
        if (!existing) return res.status(404).json({ message: 'Whiteboard not found' });

        const { fileUrl } = await uploadFile(file);

        // We could log this in a separate Asset table if we want,
        // but for tldraw we just need to return the URL so it can embed it.
        res.status(201).json({ url: fileUrl });
    } catch (error) {
        console.error('Whiteboard asset upload error:', error);
        res.status(500).json({ message: 'Failed to upload asset' });
    }
});

export default router;
