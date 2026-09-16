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

        // 1. Upload to Cloudflare via S3 utility
        const { fileUrl } = await uploadFile(file);

        // 2. Create Asset in the Workspace Asset Library
        const asset = await prisma.asset.create({
            data: {
                workspaceId,
                fileName: file.originalname,
                fileUrl,
                fileSize: file.size,
                mimeType: file.mimetype,
                uploadedById: userId,
            },
        });

        // 3. Link the Asset to the Card
        await prisma.cardAsset.create({
            data: {
                cardId,
                assetId: asset.id,
            },
        });

        await logActivity(cardId, userId, 'attached a file', file.originalname);

        // Return the asset (which frontend expects as an attachment object)
        res.status(201).json(asset);
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

        // Fetch Assets that are linked to this card
        const assets = await prisma.asset.findMany({
            where: {
                cardLinks: { some: { cardId } }
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(assets);
    } catch (error) {
        console.error('Get attachments error:', error);
        res.status(500).json({ message: 'Failed to fetch attachments' });
    }
};

export const deleteAttachment = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;
        const assetId = req.params.attachmentId as string; // The frontend calls it attachmentId, but it's now an assetId

        const card = await assertCardAccess(workspaceId, cardId, req.user!.userId);
        if (!card) {
            return res.status(404).json({ message: 'Card not found or access denied' });
        }

        // Unlink from the card by deleting the CardAsset relationship
        await prisma.cardAsset.deleteMany({
            where: {
                cardId,
                assetId,
            }
        });

        // DO NOT delete the underlying Asset or the Cloudflare file.
        // It stays in the Asset Library.

        await logActivity(cardId, req.user!.userId, 'removed an attachment', '');

        res.json({ message: 'Unlinked attachment from card successfully' });
    } catch (error) {
        console.error('Delete attachment error:', error);
        res.status(500).json({ message: 'Failed to delete attachment' });
    }
};
