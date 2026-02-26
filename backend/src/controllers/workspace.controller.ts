import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

// --- Validation Schemas ---
const createWorkspaceSchema = z.object({
    name: z.string().min(2).max(100),
});

const inviteMemberSchema = z.object({
    email: z.string().email(),
    role: z.enum(['ADMIN', 'MEMBER']).optional().default('MEMBER'),
});

const updateMemberRoleSchema = z.object({
    role: z.enum(['ADMIN', 'MEMBER']),
});

// --- Controllers ---

/**
 * POST /api/workspaces
 * Creates a new workspace and adds the creator as ADMIN.
 * Uses a Prisma transaction for atomicity.
 */
export const createWorkspace = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createWorkspaceSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const { name } = parsed.data;

        const workspace = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const ws = await tx.workspace.create({
                data: { name, ownerId: userId },
            });

            await tx.workspaceMember.create({
                data: { workspaceId: ws.id, userId, role: 'ADMIN' },
            });

            return ws;
        });

        res.status(201).json(workspace);
    } catch (error) {
        console.error('Create workspace error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/workspaces
 * Lists all workspaces the authenticated user is a member of.
 */
export const getWorkspaces = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;

        const workspaces = await prisma.workspace.findMany({
            where: {
                members: { some: { userId } },
            },
            include: {
                _count: { select: { members: true, boards: true } },
                owner: { select: { id: true, name: true, email: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(workspaces);
    } catch (error) {
        console.error('Get workspaces error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/workspaces/:id
 * Returns a single workspace with its members.
 */
export const getWorkspaceById = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const id = req.params.id as string;

        const workspace = await prisma.workspace.findFirst({
            where: {
                id,
                members: { some: { userId } },
            },
            include: {
                members: {
                    include: { user: { select: { id: true, name: true, email: true } } },
                },
                owner: { select: { id: true, name: true, email: true } },
                _count: { select: { boards: true } },
            },
        });

        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        res.json(workspace);
    } catch (error) {
        console.error('Get workspace error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * POST /api/workspaces/:id/invite
 * Invites a user (by email) to a workspace. Only ADMINs can invite.
 */
export const inviteMember = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = inviteMemberSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.id as string;
        const { email, role } = parsed.data;

        // Check if requester is an ADMIN of this workspace
        const requesterMembership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });

        if (!requesterMembership || requesterMembership.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Only admins can invite members' });
        }

        // Find the user to invite
        const invitee = await prisma.user.findUnique({ where: { email } });
        if (!invitee) {
            return res.status(404).json({ message: 'User with this email not found' });
        }

        // Check if already a member
        const existingMember = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: invitee.id } },
        });

        if (existingMember) {
            return res.status(400).json({ message: 'User is already a member of this workspace' });
        }

        const member = await prisma.workspaceMember.create({
            data: { workspaceId, userId: invitee.id, role },
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        res.status(201).json(member);
    } catch (error) {
        console.error('Invite member error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/workspaces/:id/members/:memberId
 * Updates a member's role. Only ADMINs can do this.
 */
export const updateMemberRole = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = updateMemberRoleSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const workspaceId = req.params.id as string;
        const memberId = req.params.memberId as string;
        const { role } = parsed.data;

        // Verify requester is ADMIN
        const requesterMembership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });

        if (!requesterMembership || requesterMembership.role !== 'ADMIN') {
            return res.status(403).json({ message: 'Only admins can update roles' });
        }

        // Prevent demoting yourself if you're the workspace owner
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (workspace?.ownerId === memberId && role === 'MEMBER') {
            return res.status(400).json({ message: 'Cannot demote workspace owner' });
        }

        const updated = await prisma.workspaceMember.update({
            where: { workspaceId_userId: { workspaceId, userId: memberId } },
            data: { role },
            include: { user: { select: { id: true, name: true, email: true } } },
        });

        res.json(updated);
    } catch (error) {
        console.error('Update member role error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/workspaces/:id/members/:memberId
 * Removes a member from the workspace. ADMINs can remove others; any member can leave.
 */
export const removeMember = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const workspaceId = req.params.id as string;
        const memberId = req.params.memberId as string;

        // Prevent removing the workspace owner
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
        if (!workspace) {
            return res.status(404).json({ message: 'Workspace not found' });
        }

        if (workspace.ownerId === memberId) {
            return res.status(400).json({ message: 'Cannot remove workspace owner' });
        }

        // Allow self-removal, or ADMIN removal
        if (userId !== memberId) {
            const requesterMembership = await prisma.workspaceMember.findUnique({
                where: { workspaceId_userId: { workspaceId, userId } },
            });

            if (!requesterMembership || requesterMembership.role !== 'ADMIN') {
                return res.status(403).json({ message: 'Only admins can remove members' });
            }
        }

        await prisma.workspaceMember.delete({
            where: { workspaceId_userId: { workspaceId, userId: memberId } },
        });

        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
