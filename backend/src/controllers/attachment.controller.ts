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

        res.status(201).json(attachment);
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

        const attachments = await prisma.attachment.findMany({
            where: { cardId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(attachments);
    } catch (error) {
        console.error('Get attachments error:', error);
        res.status(500).json({ message: 'Failed to fetch attachments' });
    }
};

export const deleteAttachment = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const cardId = req.params.cardId as string;
        const attachmentId = req.params.attachmentId as string;

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

        // Try deleting from R2 or local storage
        await deleteFile(attachment.fileUrl);

        await prisma.attachment.delete({
            where: { id: attachmentId },
        });

        await logActivity(cardId, req.user!.userId, 'deleted attachment', attachment.fileName);

        res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
        console.error('Delete attachment error:', error);
        res.status(500).json({ message: 'Failed to delete attachment' });
    }
};
