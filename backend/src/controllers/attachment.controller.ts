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
            await deleteFile(localAttachment.fileUrl);
            await prisma.attachment.delete({ where: { id } });
            await logActivity(cardId, req.user!.userId, 'deleted attachment', localAttachment.fileName);
            return res.json({ message: 'Attachment deleted permanently' });
        }

        // Check if it's an asset link
        const cardAsset = await prisma.cardAsset.findUnique({ where: { cardId_assetId: { cardId, assetId: id } } });
        if (cardAsset) {
            await prisma.cardAsset.delete({ where: { id: cardAsset.id } });
            await logActivity(cardId, req.user!.userId, 'unlinked asset', '');
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

        // Delete old attachment
        await prisma.attachment.delete({ where: { id: attachmentId } });

        res.json({ ...asset, isLibraryAsset: true });
    } catch (error) {
        console.error('Save to asset library error:', error);
        res.status(500).json({ message: 'Failed to save to asset library' });
    }
};
