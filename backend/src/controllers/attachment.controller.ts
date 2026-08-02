import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { uploadFile, deleteFile } from '../utils/s3';
import { AuthRequest } from '../middleware/auth.middleware';
import { logActivity } from '../utils/activity.helper';

export const uploadAttachment = async (req: AuthRequest, res: Response) => {
    try {
        const cardId = req.params.cardId as string;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const card = await prisma.card.findUnique({ where: { id: cardId } });
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
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

        if (req.user?.userId) {
            await logActivity(cardId, req.user.userId, 'attached a file', file.originalname);
        }

        res.status(201).json(attachment);
    } catch (error) {
        console.error('Upload attachment error:', error);
        res.status(500).json({ message: 'Failed to upload attachment' });
    }
};

export const getAttachments = async (req: Request, res: Response) => {
    try {
        const cardId = req.params.cardId as string;
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
        const cardId = req.params.cardId as string;
        const attachmentId = req.params.attachmentId as string;

        const attachment = await prisma.attachment.findUnique({
            where: { id: attachmentId },
        });

        if (!attachment) {
            return res.status(404).json({ message: 'Attachment not found' });
        }

        // Try deleting from R2 or local storage
        await deleteFile(attachment.fileUrl);

        await prisma.attachment.delete({
            where: { id: attachmentId },
        });

        if (req.user?.userId) {
            await logActivity(cardId, req.user.userId, 'deleted attachment', attachment.fileName);
        }

        res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
        console.error('Delete attachment error:', error);
        res.status(500).json({ message: 'Failed to delete attachment' });
    }
};
