import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];

    try {
        // Pin the algorithm to prevent algorithm-confusion attacks
        const decoded = jwt.verify(token, JWT_SECRET || 'secret', { algorithms: ['HS256'] }) as { userId: string };
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Unauthorized' });
    }
};
