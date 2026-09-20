import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { uploadFile, deleteFile } from '../utils/s3';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/activity.helper';

// Verify requester is a workspace member and the card belongs to that workspace
async function assertCardAccess(workspaceId: string, cardId: string, userId: string) {
    const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) return null;


    return prisma.card.findFirst({
        where: { id: cardId, list: { board: { workspaceId } } },
    });
}

export const uploadAttachment = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;
        const file = req.file;
        const userId = req.user!.userId;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const card = await assertCardAccess(workspaceId, cardId, userId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found or access denied' });
        }

        const { fileUrl } = await uploadFile(file);

        // Upload directly as a local Card Attachment by default
        const attachment = await prisma.attachment.create({
            data: {
                cardId,
                fileName: file.originalname,
                fileUrl,
                fileSize: file.size,
                mimeType: file.mimetype,
            },
        });

        await logActivity(cardId, userId, 'attached a file', file.originalname);

        res.status(201).json({ ...attachment, isLibraryAsset: false });
    } catch (error: any) {
        if (error?.message === 'File type not allowed') {
            return res.status(400).json({ message: error.message });
        }
        console.error('Upload attachment error:', error);
        res.status(500).json({ message: 'Failed to upload attachment' });
    }
};

export const getAttachments = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;

        const card = await assertCardAccess(workspaceId, cardId, req.user!.userId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found or access denied' });
        }

        // Fetch local card attachments
        const localAttachments = await prisma.attachment.findMany({
            where: { cardId },
            orderBy: { createdAt: 'desc' },
        });

        // Fetch assets linked from the Asset Library
        const linkedAssets = await prisma.asset.findMany({
            where: { cardLinks: { some: { cardId } } },
            orderBy: { createdAt: 'desc' },
        });

        // Merge and sort
        const mappedAssets = linkedAssets.map(a => ({ ...a, isLibraryAsset: true }));
        const mappedLocal = localAttachments.map(a => ({ ...a, isLibraryAsset: false }));
        
        const merged = [...mappedLocal, ...mappedAssets].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        res.json(merged);
    } catch (error) {
        console.error('Get attachments error:', error);
        res.status(500).json({ message: 'Failed to fetch attachments' });
    }
};

export const deleteAttachment = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;
        const id = req.params.attachmentId as string;

        const card = await assertCardAccess(workspaceId, cardId, req.user!.userId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found or access denied' });
        }

        // Check if it's a local attachment
        const localAttachment = await prisma.attachment.findFirst({ where: { id, cardId } });
        if (localAttachment) {
            // Check if any Asset in the library or another card shares this fileUrl
            const sharedAsset = await prisma.asset.findFirst({ where: { fileUrl: localAttachment.fileUrl } });
            const otherAttachment = await prisma.attachment.findFirst({
                where: { fileUrl: localAttachment.fileUrl, id: { not: id } }
            });

            // Only delete from Cloudflare R2 if NO other Asset or Attachment references it
            if (!sharedAsset && !otherAttachment) {
                await deleteFile(localAttachment.fileUrl);
            }

            // The paired preview is a CAS object like any other, so it needs the
            // same reference check before its bytes go.
            if (localAttachment.previewUrl) {
                const previewUrl = localAttachment.previewUrl;
                const [previewAsset, previewElsewhere, previewAsMain] = await Promise.all([
                    prisma.asset.findFirst({ where: { fileUrl: previewUrl } }),
                    prisma.attachment.findFirst({ where: { previewUrl, id: { not: id } } }),
                    prisma.attachment.findFirst({ where: { fileUrl: previewUrl, id: { not: id } } }),
                ]);
                if (!previewAsset && !previewElsewhere && !previewAsMain) {
                    await deleteFile(previewUrl);
                }
            }

            await prisma.attachment.delete({ where: { id } });
            await logActivity(cardId, req.user!.userId, 'deleted attachment', localAttachment.fileName);
            return res.json({ message: 'Attachment deleted' });
        }

        // Check if it's an asset link
        const cardAsset = await prisma.cardAsset.findUnique({ where: { cardId_assetId: { cardId, assetId: id } } });
        if (cardAsset) {
            await prisma.cardAsset.delete({ where: { id: cardAsset.id } });
            await logActivity(cardId, req.user!.userId, 'unlinked asset from card', '');
            return res.json({ message: 'Asset unlinked from card' });
        }

        res.status(404).json({ message: 'Attachment not found' });
    } catch (error) {
        console.error('Delete attachment error:', error);
        res.status(500).json({ message: 'Failed to delete attachment' });
    }
};

export const saveToAssetLibrary = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;
        const attachmentId = req.params.attachmentId as string;
        const userId = req.user!.userId;

        const card = await assertCardAccess(workspaceId, cardId, userId);
        if (!card) return res.status(404).json({ message: 'Card not found' });

        const localAttachment = await prisma.attachment.findFirst({ where: { id: attachmentId, cardId } });
        if (!localAttachment) return res.status(404).json({ message: 'Local attachment not found' });

        // Create Asset
        const asset = await prisma.asset.create({
            data: {
                workspaceId,
                fileName: localAttachment.fileName,
                fileUrl: localAttachment.fileUrl,
                fileSize: localAttachment.fileSize,
                mimeType: localAttachment.mimeType,
                uploadedById: userId,
                createdAt: localAttachment.createdAt, // Preserve original timestamp
            },
        });

        // Link to card
        await prisma.cardAsset.create({
            data: {
                cardId,
                assetId: asset.id,
            },
        });

        // Delete old attachment row
        await prisma.attachment.delete({ where: { id: attachmentId } });

        res.json({ ...asset, isLibraryAsset: true });
    } catch (error) {
        console.error('Save to asset library error:', error);
        res.status(500).json({ message: 'Failed to save to asset library' });
    }
};

export const linkAssetToCard = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;
        const assetId = req.params.assetId as string;
        const userId = req.user!.userId;

        const card = await assertCardAccess(workspaceId, cardId, userId);
        if (!card) return res.status(404).json({ message: 'Card not found or access denied' });

        const asset = await prisma.asset.findFirst({ where: { id: assetId, workspaceId } });
        if (!asset) return res.status(404).json({ message: 'Asset not found in this workspace' });

        const existing = await prisma.cardAsset.findUnique({
            where: { cardId_assetId: { cardId, assetId } }
        });
        if (!existing) {
            await prisma.cardAsset.create({
                data: { cardId, assetId }
            });
            await logActivity(cardId, userId, 'attached library asset', asset.fileName);
        }

        res.status(201).json({ ...asset, isLibraryAsset: true });
    } catch (error) {
        console.error('Link asset to card error:', error);
        res.status(500).json({ message: 'Failed to link asset to card' });
    }
};

/**
 * POST /:boardId/cards/:cardId/attachments/:attachmentId/preview
 *
 * Attaches a browser-renderable stand-in to an existing attachment.
 *
 * Exists because the two useful formats pull in opposite directions: an FBX
 * imports cleanly into a game engine but <model-viewer> cannot read it, while a
 * GLB previews everywhere but is the wrong hand-off for the engine. Uploading
 * both as separate attachments clutters the card and loses the relationship
 * between them. This keeps one row: Download returns the real file, the preview
 * is what the card renders.
 */
export const uploadAttachmentPreview = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;
        const attachmentId = req.params.attachmentId as string;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const card = await assertCardAccess(workspaceId, cardId, req.user!.userId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found or access denied' });
        }

        const attachment = await prisma.attachment.findFirst({
            where: { id: attachmentId, cardId },
        });
        if (!attachment) {
            return res.status(404).json({ message: 'Attachment not found' });
        }

        // Only glTF renders in the browser, so anything else would be a preview
        // that cannot preview.
        const name = file.originalname.toLowerCase();
        if (!name.endsWith('.glb') && !name.endsWith('.gltf')) {
            return res.status(400).json({
                message: 'A preview must be a .glb or .gltf file',
            });
        }

        const { fileUrl } = await uploadFile(file);

        const updated = await prisma.attachment.update({
            where: { id: attachmentId },
            data: {
                previewUrl: fileUrl,
                previewFileName: file.originalname,
                previewFileSize: file.size,
            },
        });

        res.json({ ...updated, isLibraryAsset: false });
    } catch (error) {
        console.error('Upload attachment preview error:', error);
        res.status(500).json({ message: 'Failed to attach preview' });
    }
};
