import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { generateToken } from '../utils/accessToken';

const createTokenSchema = z.object({
    label: z.string().trim().min(1).max(100),
    /** Optional lifetime in days. Omitted means the token never expires. */
    expiresInDays: z.number().int().min(1).max(3650).optional(),
});

/** Per-user cap, so a runaway client cannot fill the table. */
const MAX_TOKENS_PER_USER = 20;

/**
 * POST /api/auth/tokens
 * Creates a personal access token. The plaintext is returned exactly once.
 */
export const createAccessToken = async (req: AuthRequest, res: Response) => {
    try {
        const parsed = createTokenSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const userId = req.user!.userId;
        const { label, expiresInDays } = parsed.data;

        const existingCount = await prisma.personalAccessToken.count({ where: { userId } });
        if (existingCount >= MAX_TOKENS_PER_USER) {
            return res.status(400).json({
                message: `Token limit reached (${MAX_TOKENS_PER_USER}). Revoke an existing token first.`,
            });
        }

        const { token, tokenHash, prefix } = generateToken();

        const created = await prisma.personalAccessToken.create({
            data: {
                userId,
                tokenHash,
                prefix,
                label,
                expiresAt: expiresInDays
                    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
                    : null,
            },
            select: { id: true, label: true, prefix: true, expiresAt: true, createdAt: true },
        });

        res.status(201).json({
            ...created,
            // The only time this value is ever available.
            token,
            message: 'Copy this token now — it will not be shown again.',
        });
    } catch (error) {
        console.error('Create access token error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * GET /api/auth/tokens
 * Lists the caller's tokens. Never returns token material.
 */
export const listAccessTokens = async (req: AuthRequest, res: Response) => {
    try {
        const tokens = await prisma.personalAccessToken.findMany({
            where: { userId: req.user!.userId },
            select: {
                id: true,
                label: true,
                prefix: true,
                lastUsedAt: true,
                expiresAt: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        res.json(tokens);
    } catch (error) {
        console.error('List access tokens error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/auth/tokens/:tokenId
 * Revokes a token immediately.
 */
export const revokeAccessToken = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const tokenId = req.params.tokenId as string;

        // Scope by userId so one user cannot revoke another's token by id.
        const existing = await prisma.personalAccessToken.findFirst({
            where: { id: tokenId, userId },
            select: { id: true },
        });
        if (!existing) {
            return res.status(404).json({ message: 'Token not found' });
        }

        await prisma.personalAccessToken.delete({ where: { id: existing.id } });

        res.json({ message: 'Token revoked' });
    } catch (error) {
        console.error('Revoke access token error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
