import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest, requireAuth } from '../middleware/auth.middleware';
import { uploadAssetFile, deleteFile } from '../utils/s3';
import { uploadLimiter } from '../middleware/rateLimit.middleware';
import multer from 'multer';
import { z } from 'zod';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 250 * 1024 * 1024 } // 250MB
});

// Helper middleware to check workspace membership
const requireWorkspaceMember = async (req: AuthRequest, res: any, next: any) => {
    const workspaceId = req.params.workspaceId as string;
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const member = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } }
        });
        if (!member) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        next();
    } catch (error) {
        next(error);
    }
};

router.use(requireWorkspaceMember);

// =======================
// FOLDERS CRUD
// =======================
const folderSchema = z.object({
    name: z.string().min(1),
    parentId: z.string().optional().nullable(),
});

router.post('/folders', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const { name, parentId } = folderSchema.parse(req.body);

        if (parentId) {
            const parent = await prisma.assetFolder.findUnique({ where: { id: parentId } });
            if (!parent || parent.workspaceId !== workspaceId) {
                return res.status(400).json({ message: 'Invalid parent folder' });
            }
        }

        const folder = await prisma.assetFolder.create({
            data: {
                name,
                workspaceId,
                parentId: parentId || null
            }
        });
        res.status(201).json(folder);
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(error.format());
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/folders', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const folders = await prisma.assetFolder.findMany({
            where: { workspaceId },
            include: {
                _count: { select: { assets: true } },
                children: true
            }
        });
        res.json(folders);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.patch('/folders/:folderId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const folderId = req.params.folderId as string;
        const { name, parentId } = folderSchema.parse(req.body);

        const existing = await prisma.assetFolder.findUnique({ where: { id: folderId } });
        if (!existing || existing.workspaceId !== workspaceId) return res.status(404).json({ message: 'Folder not found' });

        if (parentId) {
            const parent = await prisma.assetFolder.findUnique({ where: { id: parentId } });
            if (!parent || parent.workspaceId !== workspaceId || parent.id === folderId) {
                return res.status(400).json({ message: 'Invalid parent folder' });
            }
        }

        const folder = await prisma.assetFolder.update({
            where: { id: folderId },
            data: { name, parentId: parentId || null }
        });
        res.json(folder);
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(error.format());
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/folders/:folderId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const folderId = req.params.folderId as string;
        const existing = await prisma.assetFolder.findUnique({ where: { id: folderId } });
        if (!existing || existing.workspaceId !== workspaceId) return res.status(404).json({ message: 'Folder not found' });

        await prisma.asset.updateMany({
            where: { folderId, workspaceId },
            data: { folderId: null }
        });

        await prisma.assetFolder.delete({ where: { id: folderId } });
        res.json({ message: 'Folder deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});


// =======================
// TAGS CRUD
// =======================
const tagSchema = z.object({
    name: z.string().min(1),
    color: z.string().optional().default('#6366f1'),
});

router.post('/tags', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const { name, color } = tagSchema.parse(req.body);

        const existing = await prisma.assetTag.findUnique({
            where: { workspaceId_name: { workspaceId, name } }
        });
        if (existing) return res.status(400).json({ message: 'Tag already exists' });

        const tag = await prisma.assetTag.create({
            data: { name, color, workspaceId }
        });
        res.status(201).json(tag);
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(error.format());
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/tags', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const tags = await prisma.assetTag.findMany({
            where: { workspaceId },
            include: { _count: { select: { assignments: true } } }
        });
        res.json(tags);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.patch('/tags/:tagId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const tagId = req.params.tagId as string;
        const { name, color } = tagSchema.parse(req.body);

        const existing = await prisma.assetTag.findUnique({ where: { id: tagId } });
        if (!existing || existing.workspaceId !== workspaceId) return res.status(404).json({ message: 'Tag not found' });

        const tag = await prisma.assetTag.update({
            where: { id: tagId },
            data: { name, color }
        });
        res.json(tag);
    } catch (error) {
        if (error instanceof z.ZodError) return res.status(400).json(error.format());
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/tags/:tagId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const tagId = req.params.tagId as string;
        const existing = await prisma.assetTag.findUnique({ where: { id: tagId } });
        if (!existing || existing.workspaceId !== workspaceId) return res.status(404).json({ message: 'Tag not found' });

        await prisma.assetTagAssignment.deleteMany({ where: { tagId } });
        await prisma.assetTag.delete({ where: { id: tagId } });
        res.json({ message: 'Tag deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});


// =======================
// ASSETS CRUD
// =======================
router.post('/', uploadLimiter, upload.single('file'), async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const userId = req.user!.userId;
        const file = req.file;

        if (!file) return res.status(400).json({ message: 'No file uploaded' });

        let folderId = req.body.folderId || null;
        if (folderId) {
            const folder = await prisma.assetFolder.findUnique({ where: { id: folderId } });
            if (!folder || folder.workspaceId !== workspaceId) folderId = null;
        }

        let tagIds: string[] = [];
        if (req.body.tagIds) {
            try {
                tagIds = JSON.parse(req.body.tagIds);
                if (!Array.isArray(tagIds)) tagIds = [];
            } catch (e) { }
        }

        const { fileUrl, key } = await uploadAssetFile(file);

        const asset = await prisma.asset.create({
            data: {
                workspaceId,
                folderId,
                fileName: file.originalname,
                fileUrl,
                fileSize: file.size,
                mimeType: file.mimetype,
                uploadedById: userId,
                tags: {
                    create: tagIds.map(tagId => ({ tagId }))
                }
            },
            include: { tags: { include: { tag: true } } }
        });

        res.status(201).json(asset);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const { folderId, tagId, search, mimeType, page = '1', limit = '50' } = req.query;

        const p = parseInt(page as string) || 1;
        const l = parseInt(limit as string) || 50;

        const where: any = { workspaceId };
        if (folderId) where.folderId = folderId;
        if (tagId) {
            where.tags = { some: { tagId } };
        }
        if (search) {
            where.fileName = { contains: search, mode: 'insensitive' };
        }
        if (mimeType) {
            where.mimeType = { startsWith: mimeType };
        }

        const total = await prisma.asset.count({ where });
        const assets = await prisma.asset.findMany({
            where,
            include: {
                tags: { include: { tag: true } },
                folder: true,
                uploadedBy: { select: { id: true, name: true, avatarUrl: true } }
            },
            skip: (p - 1) * l,
            take: l,
            orderBy: { createdAt: 'desc' }
        });

        res.json({ assets, total, page: p, limit: l });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/card/:cardId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;
        
        const cardLinks = await prisma.cardAsset.findMany({
            where: { cardId, asset: { workspaceId } },
            include: {
                asset: {
                    include: {
                        tags: { include: { tag: true } }
                    }
                }
            }
        });
        
        res.json(cardLinks.map(link => link.asset));
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.get('/:assetId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const assetId = req.params.assetId as string;
        const asset = await prisma.asset.findUnique({
            where: { id: assetId },
            include: {
                tags: { include: { tag: true } },
                folder: true,
                uploadedBy: { select: { name: true } },
                cardLinks: { include: { card: { select: { id: true, title: true } } } }
            }
        });

        if (!asset || asset.workspaceId !== workspaceId) return res.status(404).json({ message: 'Asset not found' });
        res.json(asset);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.patch('/:assetId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const assetId = req.params.assetId as string;
        const { fileName, folderId } = req.body;

        const existing = await prisma.asset.findUnique({ where: { id: assetId } });
        if (!existing || existing.workspaceId !== workspaceId) return res.status(404).json({ message: 'Asset not found' });

        if (folderId !== undefined && folderId !== null) {
            const folder = await prisma.assetFolder.findUnique({ where: { id: folderId } });
            if (!folder || folder.workspaceId !== workspaceId) {
                return res.status(400).json({ message: 'Invalid folder' });
            }
        }

        const data: any = {};
        if (fileName !== undefined) data.fileName = fileName;
        if (folderId !== undefined) data.folderId = folderId;

        const asset = await prisma.asset.update({
            where: { id: assetId },
            data,
            include: { tags: { include: { tag: true } } }
        });
        res.json(asset);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/:assetId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const assetId = req.params.assetId as string;
        const existing = await prisma.asset.findUnique({ where: { id: assetId } });
        if (!existing || existing.workspaceId !== workspaceId) return res.status(404).json({ message: 'Asset not found' });

        await deleteFile(existing.fileUrl);

        await prisma.assetTagAssignment.deleteMany({ where: { assetId } });
        await prisma.cardAsset.deleteMany({ where: { assetId } });
        await prisma.asset.delete({ where: { id: assetId } });

        res.json({ message: 'Asset deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

// =======================
// ASSET TAGS
// =======================
router.post('/:assetId/tags/:tagId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const assetId = req.params.assetId as string;
        const tagId = req.params.tagId as string;
        
        const asset = await prisma.asset.findUnique({ where: { id: assetId } });
        const tag = await prisma.assetTag.findUnique({ where: { id: tagId } });
        
        if (!asset || asset.workspaceId !== workspaceId) return res.status(404).json({ message: 'Asset not found' });
        if (!tag || tag.workspaceId !== workspaceId) return res.status(404).json({ message: 'Tag not found' });
        
        const assignment = await prisma.assetTagAssignment.create({
            data: { assetId, tagId }
        });
        res.status(201).json(assignment);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/:assetId/tags/:tagId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const assetId = req.params.assetId as string;
        const tagId = req.params.tagId as string;
        
        const asset = await prisma.asset.findUnique({ where: { id: assetId } });
        if (!asset || asset.workspaceId !== workspaceId) return res.status(404).json({ message: 'Asset not found' });
        
        await prisma.assetTagAssignment.deleteMany({
            where: { assetId, tagId }
        });
        res.json({ message: 'Tag removed from asset' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

// =======================
// CARD LINKING
// =======================
router.post('/:assetId/link/:cardId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const assetId = req.params.assetId as string;
        const cardId = req.params.cardId as string;

        const asset = await prisma.asset.findUnique({ where: { id: assetId } });
        if (!asset || asset.workspaceId !== workspaceId) return res.status(404).json({ message: 'Asset not found' });

        const card = await prisma.card.findUnique({ 
            where: { id: cardId },
            include: { list: { include: { board: true } } }
        });

        if (!card || card.list.board.workspaceId !== workspaceId) {
            return res.status(404).json({ message: 'Card not found in this workspace' });
        }

        const link = await prisma.cardAsset.create({
            data: { assetId, cardId }
        });
        res.status(201).json(link);
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

router.delete('/:assetId/link/:cardId', async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const assetId = req.params.assetId as string;
        const cardId = req.params.cardId as string;

        const asset = await prisma.asset.findUnique({ where: { id: assetId } });
        if (!asset || asset.workspaceId !== workspaceId) return res.status(404).json({ message: 'Asset not found' });

        await prisma.cardAsset.deleteMany({
            where: { assetId, cardId }
        });
        res.json({ message: 'Asset unlinked from card' });
    } catch (error) {
        res.status(500).json({ message: 'Internal server error' });
    }
});

export default router;
