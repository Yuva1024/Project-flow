import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../utils/prisma';
import { sendToDiversionSchema, listReposSchema, listFoldersSchema } from '../validators/diversionValidator';
import { streamAssetToDiversion, listDiversionRepositories, listDiversionFolders } from '../services/diversionService';

/**
 * Lists repositories accessible to the user via Diversion API.
 */
export const getDiversionRepositories = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const userId = req.user!.userId;

        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });

        if (!membership) {
            return res.status(403).json({ message: 'Access denied. You are not a member of this workspace.' });
        }

        const parsed = listReposSchema.safeParse(req.body);
        const headerKey = req.headers['x-diversion-api-key'] as string | undefined;
        const apiKey = parsed.success ? (parsed.data.apiKey || headerKey) : headerKey;

        const repos = await listDiversionRepositories(apiKey);
        return res.status(200).json({ repos });
    } catch (error: any) {
        console.error('getDiversionRepositories error:', error);
        return res.status(500).json({
            message: error?.message || 'Failed to list Diversion repositories',
        });
    }
};

/**
 * Lists folder paths in a Diversion repository branch.
 */
export const getDiversionFolders = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const userId = req.user!.userId;

        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });

        if (!membership) {
            return res.status(403).json({ message: 'Access denied. You are not a member of this workspace.' });
        }

        const parsed = listFoldersSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: 'Invalid parameters',
                errors: parsed.error.format(),
            });
        }

        const headerKey = req.headers['x-diversion-api-key'] as string | undefined;
        const apiKey = parsed.data.apiKey || headerKey;
        const { repoId, branch } = parsed.data;

        const folders = await listDiversionFolders(repoId, branch, apiKey);
        return res.status(200).json({ folders });
    } catch (error: any) {
        console.error('getDiversionFolders error:', error);
        return res.status(500).json({
            message: error?.message || 'Failed to list repository folders',
        });
    }
};

/**
 * Handles pushing an asset directly from Cloudflare R2 to a Diversion version control repository.
 */
export const sendAssetToDiversion = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.params.workspaceId as string;
        const assetId = req.params.assetId as string;
        const userId = req.user!.userId;

        // 1. Verify workspace membership
        const membership = await prisma.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId } },
        });

        if (!membership) {
            return res.status(403).json({ message: 'Access denied. You are not a member of this workspace.' });
        }

        // 2. Validate input
        const parsed = sendToDiversionSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                message: 'Invalid input parameters',
                errors: parsed.error.format(),
            });
        }

        const headerKey = req.headers['x-diversion-api-key'] as string | undefined;
        const apiKey = parsed.data.apiKey || headerKey;
        const { repoId, branch, targetPath, commitMessage } = parsed.data;

        // 3. Stream binary directly from R2 to Diversion API
        const result = await streamAssetToDiversion({
            assetId,
            workspaceId,
            repoId,
            branch,
            targetPath,
            commitMessage,
            userId,
            apiKey,
        });

        // 4. Record entry in ActivityLog
        try {
            await prisma.activityLog.create({
                data: {
                    assetId,
                    userId,
                    action: 'exported to Diversion',
                    details: JSON.stringify({
                        repoId: result.repoId,
                        branch: result.branch,
                        path: result.path,
                        fileName: result.fileName,
                    }),
                },
            });
        } catch (logErr) {
            console.warn('[ActivityLog] Failed to log Diversion export:', logErr);
        }

        return res.status(200).json({
            success: true,
            message: 'Asset successfully committed to Diversion!',
            data: result,
        });
    } catch (error: any) {
        console.error('Send to Diversion controller error:', error);
        return res.status(500).json({
            message: error?.message || 'Failed to stream asset to Diversion',
        });
    }
};
