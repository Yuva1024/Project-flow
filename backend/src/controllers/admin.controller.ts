import { Response } from 'express';
import { prisma } from '../utils/prisma';
import { collectBoardFileUrls, deleteUnreferencedFiles } from '../utils/storage.helper';
import { AuthRequest } from '../middleware/auth.middleware';

// Admin middleware - checks isAdmin flag
export const requireAdmin = async (req: AuthRequest, res: Response, next: Function) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.isAdmin) {
            return res.status(403).json({ message: 'Admin access required' });
        }

        next();
    } catch (error) {
        console.error('Admin middleware error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Get system-wide statistics
export const getAdminStats = async (req: AuthRequest, res: Response) => {
    try {
        const [totalUsers, totalWorkspaces, totalBoards, totalCards, totalAttachments] = await Promise.all([
            prisma.user.count(),
            prisma.workspace.count(),
            prisma.board.count(),
            prisma.card.count(),
            prisma.attachment.count(),
        ]);

        res.json({
            totalUsers,
            totalWorkspaces,
            totalBoards,
            totalCards,
            totalAttachments,
        });
    } catch (error) {
        console.error('getAdminStats error:', error);
        res.status(500).json({ message: 'Failed to get admin stats' });
    }
};

// Get all registered users
export const getAdminUsers = async (req: AuthRequest, res: Response) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                name: true,
                email: true,
                isAdmin: true,
                avatarUrl: true,
                createdAt: true,
                _count: {
                    select: {
                        workspacesOwned: true,
                        cardsCreated: true,
                        comments: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(users);
    } catch (error) {
        console.error('getAdminUsers error:', error);
        res.status(500).json({ message: 'Failed to get users' });
    }
};

// Delete a user (admin only)
export const deleteUser = async (req: AuthRequest, res: Response) => {
    try {
        const targetUserId = req.params.userId as string;
        const adminId = req.user?.userId;

        if (targetUserId === adminId) {
            return res.status(400).json({ message: 'Cannot delete your own admin account' });
        }

        const userWithData = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: {
                name: true,
                workspacesOwned: { select: { id: true, boards: { select: { id: true } } } },
                cardsCreated: { select: { attachments: { select: { fileUrl: true } } } },
            },
        });

        if (!userWithData) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Everything reachable from the workspaces this user owns (cascade-deleted
        // with them), plus attachments on cards they authored elsewhere.
        const ownedBoardIds = userWithData.workspacesOwned.flatMap(ws => ws.boards.map(b => b.id));
        const fileUrls = [
            ...(await collectBoardFileUrls(ownedBoardIds)),
            ...userWithData.cardsCreated.flatMap(card => card.attachments.map(att => att.fileUrl)),
        ];

        await prisma.user.delete({ where: { id: targetUserId } });

        // Only after the rows are gone can we tell which files nothing else shares.
        await deleteUnreferencedFiles(fileUrls);

        res.json({ message: `User "${userWithData.name}" deleted successfully` });
    } catch (error) {
        console.error('deleteUser error:', error);
        res.status(500).json({ message: 'Failed to delete user' });
    }
};

// Get system-wide activity logs
export const getSystemLogs = async (req: AuthRequest, res: Response) => {
    try {
        const logs = await prisma.activityLog.findMany({
            take: 100,
            orderBy: { createdAt: 'desc' },
            include: {
                user: { select: { name: true, email: true } },
                card: { select: { title: true } },
            },
        });

        res.json(logs);
    } catch (error) {
        console.error('getSystemLogs error:', error);
        res.status(500).json({ message: 'Failed to get system logs' });
    }
};
