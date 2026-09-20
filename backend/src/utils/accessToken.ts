import crypto from 'crypto';
import { prisma } from './prisma';

/**
 * Personal access tokens for non-browser clients (the Blender addon).
 *
 * A JWT is the wrong shape for a desktop tool: it expires in 7 days, cannot be
 * revoked, and would have to be re-minted from a password the addon should never
 * hold. A PAT is long-lived, individually revocable, and carries no credential
 * the user has to retype.
 *
 * Only the SHA-256 of the token is stored. The plaintext is returned once at
 * creation and is unrecoverable afterwards.
 */

/** Identifies a PAT at a glance and makes leaked tokens greppable in logs. */
export const TOKEN_PREFIX = 'pf_';

/** Bytes of entropy per token. 32 bytes -> 43 base64url chars. */
const TOKEN_BYTES = 32;

export interface GeneratedToken {
    /** Full plaintext token. Shown to the user exactly once. */
    token: string;
    tokenHash: string;
    /** Leading characters, stored so the UI can identify a row without the secret. */
    prefix: string;
}

/** SHA-256 is correct here: tokens are high-entropy random, not guessable secrets. */
export const hashToken = (token: string): string =>
    crypto.createHash('sha256').update(token).digest('hex');

export const isAccessToken = (value: string): boolean => value.startsWith(TOKEN_PREFIX);

export const generateToken = (): GeneratedToken => {
    const random = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
    const token = `${TOKEN_PREFIX}${random}`;
    return {
        token,
        tokenHash: hashToken(token),
        prefix: token.slice(0, TOKEN_PREFIX.length + 6),
    };
};

export interface ResolvedToken {
    userId: string;
    tokenId: string;
}

/**
 * Looks up a PAT and returns its owner, or null if it is unknown or expired.
 *
 * `lastUsedAt` is refreshed at most once an hour. Writing it on every request
 * would add a round-trip to every authenticated call for a field nobody reads
 * at that resolution.
 */
export const resolveAccessToken = async (token: string): Promise<ResolvedToken | null> => {
    const record = await prisma.personalAccessToken.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { id: true, userId: true, expiresAt: true, lastUsedAt: true },
    });

    if (!record) return null;

    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
        return null;
    }

    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (!record.lastUsedAt || record.lastUsedAt < anHourAgo) {
        // Best-effort: a failed timestamp update must not fail the request.
        prisma.personalAccessToken
            .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
            .catch(err => console.error('Failed to update token lastUsedAt:', err));
    }

    return { userId: record.userId, tokenId: record.id };
};
