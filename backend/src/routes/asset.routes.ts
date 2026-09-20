import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest, requireAuth } from '../middleware/auth.middleware';
import { uploadAssetFile, deleteFile } from '../utils/s3';
import { uploadLimiter } from '../middleware/rateLimit.middleware';
import { createUpload, MAX_ASSET_SIZE } from '../middleware/upload.middleware';
import { z } from 'zod';
import {
    sendAssetToDiversion,
    getDiversionRepositories,
    getDiversionFolders,
} from '../controllers/asset.controller';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const upload = createUpload(MAX_ASSET_SIZE);

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
            // Walk up from the proposed parent: if we meet this folder on the way,
            // the move would create a cycle and any recursive walk would never end.
            let cursor: string | null = parent.parentId;
            const seen = new Set<string>([parent.id]);
            while (cursor) {
                if (cursor === folderId) {
                    return res.status(400).json({ message: 'Cannot move a folder inside its own subtree' });
                }
                if (seen.has(cursor)) break;
                seen.add(cursor);
                const next: { parentId: string | null } | null = await prisma.assetFolder.findUnique({
                    where: { id: cursor },
                    select: { parentId: true },
                });
                cursor = next?.parentId ?? null;
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
const updateAssetSchema = z.object({
    fileName: z.string().trim().min(1).max(255).optional(),
    folderId: z.string().uuid().nullable().optional(),
});

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
            const ids = (tagId as string).split(',').map(id => id.trim()).filter(Boolean);
            if (ids.length > 0) {
                where.tags = { some: { tagId: { in: ids } } };
            }
        }
        if (search) {
            where.fileName = { contains: search, mode: 'insensitive' };
        }
        if (mimeType) {
            const types = (mimeType as string).split(',').map(s => s.trim().toLowerCase());
            const conditions: any[] = [];
            for (const t of types) {
                if (t === '3d') {
                    conditions.push(
                        { mimeType: { contains: 'gltf' } },
                        { mimeType: { contains: 'glb' } },
                        { fileName: { endsWith: '.glb', mode: 'insensitive' } },
                        { fileName: { endsWith: '.gltf', mode: 'insensitive' } },
                        { fileName: { endsWith: '.obj', mode: 'insensitive' } },
                        { fileName: { endsWith: '.fbx', mode: 'insensitive' } }
                    );
                } else if (t === 'image') {
                    conditions.push(
                        { mimeType: { startsWith: 'image/' } },
                        { fileName: { endsWith: '.png', mode: 'insensitive' } },
                        { fileName: { endsWith: '.jpg', mode: 'insensitive' } },
                        { fileName: { endsWith: '.jpeg', mode: 'insensitive' } },
                        { fileName: { endsWith: '.webp', mode: 'insensitive' } }
                    );
                } else if (t === 'video') {
                    conditions.push({ mimeType: { startsWith: 'video/' } });
                } else if (t === 'audio') {
                    conditions.push({ mimeType: { startsWith: 'audio/' } });
                } else {
                    conditions.push({ mimeType: { startsWith: t } });
                }
            }
            if (conditions.length > 0) {
                where.OR = conditions;
            }
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

        const card = await prisma.card.findFirst({
            where: { id: cardId, list: { board: { workspaceId } } },
            select: { id: true },
        });
        if (!card) return res.status(404).json({ message: 'Card not found in this workspace' });

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
        const parsed = updateAssetSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(parsed.error.format());
        const { fileName, folderId } = parsed.data;

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
        const existing = await prisma.asset.findUnique({
            where: { id: assetId },
            include: { cardLinks: true }
        });
        if (!existing || existing.workspaceId !== workspaceId) return res.status(404).json({ message: 'Asset not found' });

        // If this asset was attached to any cards, convert those links into local card attachments
        // so the cards NEVER break and keep their files!
        const hasLinkedCards = existing.cardLinks && existing.cardLinks.length > 0;
        if (hasLinkedCards) {
            // Skip cards that already hold a plain attachment for these exact bytes,
            // otherwise the card ends up showing the same file twice.
            const alreadyAttached = await prisma.attachment.findMany({
                where: {
                    fileUrl: existing.fileUrl,
                    cardId: { in: existing.cardLinks.map(link => link.cardId) },
                },
                select: { cardId: true },
            });
            const skip = new Set(alreadyAttached.map(a => a.cardId));

            const toCreate = existing.cardLinks
                .filter(link => !skip.has(link.cardId))
                .map(link => ({
                    cardId: link.cardId,
                    fileName: existing.fileName,
                    fileUrl: existing.fileUrl,
                    fileSize: existing.fileSize,
                    mimeType: existing.mimeType,
                    createdAt: existing.createdAt,
                }));

            if (toCreate.length > 0) {
                await prisma.attachment.createMany({ data: toCreate });
            }
        }

        // Check if any other attachments or assets reference this fileUrl
        const otherAttachment = await prisma.attachment.findFirst({
            where: { fileUrl: existing.fileUrl }
        });
        const otherAsset = await prisma.asset.findFirst({
            where: { fileUrl: existing.fileUrl, id: { not: assetId } }
        });

        // Only delete from Cloudflare R2 if NO cards or other library assets reference it
        if (!hasLinkedCards && !otherAttachment && !otherAsset) {
            await deleteFile(existing.fileUrl);
        }

        await prisma.assetTagAssignment.deleteMany({ where: { assetId } });
        await prisma.cardAsset.deleteMany({ where: { assetId } });
        await prisma.asset.delete({ where: { id: assetId } });

        res.json({ message: 'Asset deleted from library' });
    } catch (error) {
        console.error('Delete asset error:', error);
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
        
        const existing = await prisma.assetTagAssignment.findUnique({
            where: { assetId_tagId: { assetId, tagId } }
        });
        if (existing) return res.status(409).json({ message: 'Tag already assigned to this asset' });

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

        const existingLink = await prisma.cardAsset.findUnique({
            where: { cardId_assetId: { cardId, assetId } }
        });
        if (existingLink) return res.status(409).json({ message: 'Asset is already linked to this card' });

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

// Diversion Version Control Integration
router.post('/diversion/repos', getDiversionRepositories);
router.post('/diversion/folders', getDiversionFolders);
router.post('/:assetId/send-to-diversion', sendAssetToDiversion);

export default router;
