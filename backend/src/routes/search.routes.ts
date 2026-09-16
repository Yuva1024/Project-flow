import { Router, Response } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest, requireAuth } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/search?q=<query>
 * Global search across every workspace the user belongs to.
 * Returns matching boards and cards with enough context to navigate to them.
 */
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const q = (req.query.q as string || '').trim();
        if (q.length < 2) {
            return res.json({ boards: [], cards: [] });
        }

        const userId = req.user!.userId;

        const memberships = await prisma.workspaceMember.findMany({
            where: { userId },
            select: { workspaceId: true },
        });
        const workspaceIds = memberships.map(m => m.workspaceId);
        if (workspaceIds.length === 0) {
            return res.json({ boards: [], cards: [] });
        }

        const [boards, cards] = await Promise.all([
            prisma.board.findMany({
                where: {
                    workspaceId: { in: workspaceIds },
                    title: { contains: q, mode: 'insensitive' },
                },
                select: {
                    id: true,
                    title: true,
                    workspaceId: true,
                    _count: { select: { lists: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: 8,
            }),
            prisma.card.findMany({
                where: {
                    list: { board: { workspaceId: { in: workspaceIds } } },
                    title: { contains: q, mode: 'insensitive' },
                },
                select: {
                    id: true,
                    title: true,
                    priority: true,
                    dueDate: true,
                    list: {
                        select: {
                            title: true,
                            board: { select: { id: true, title: true, workspaceId: true } },
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: 15,
            }),
        ]);

        res.json({ boards, cards });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

export default router;
