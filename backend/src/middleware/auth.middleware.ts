import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isAccessToken, resolveAccessToken } from '../utils/accessToken';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('FATAL: JWT_SECRET must be set in production');
    }
    console.warn('[WARN] JWT_SECRET is not set — using insecure fallback. Set JWT_SECRET before deploying!');
}

export interface AuthRequest extends Request {
    user?: {
        userId: string;
    };
    /** Set when the caller authenticated with a personal access token rather than a session JWT. */
    accessTokenId?: string;
}

/**
 * Accepts two credential types on the same header:
 *
 *   Bearer <jwt>    — browser sessions, 7 day expiry, verified without a DB hit
 *   Bearer pf_...   — personal access tokens, long-lived and revocable (Blender addon)
 *
 * The JWT path stays synchronous so the web app pays nothing for this.
 */
export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const credential = authHeader.slice('Bearer '.length).trim();
    if (!credential) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    if (isAccessToken(credential)) {
        try {
            const resolved = await resolveAccessToken(credential);
            if (!resolved) {
                return res.status(401).json({ message: 'Unauthorized' });
            }
            req.user = { userId: resolved.userId };
            req.accessTokenId = resolved.tokenId;
            return next();
        } catch (error) {
            console.error('Access token verification error:', error);
            return res.status(500).json({ message: 'Internal Server Error' });
        }
    }

    try {
        // Pin the algorithm to prevent algorithm-confusion attacks
        const decoded = jwt.verify(credential, JWT_SECRET || 'secret', { algorithms: ['HS256'] }) as { userId: string };
        req.user = { userId: decoded.userId };
        return next();
    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
};

/**
 * Blocks personal access tokens on a route.
 *
 * Token management itself must not be reachable with a token, otherwise a leaked
 * PAT could mint replacements for itself and survive revocation.
 */
export const requireSession = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.accessTokenId) {
        return res.status(403).json({
            message: 'This action requires signing in with your password, not an access token.',
        });
    }
    next();
};
