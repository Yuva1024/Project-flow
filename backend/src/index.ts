import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import hpp from 'hpp';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import workspaceRoutes from './routes/workspace.routes';
import boardRoutes from './routes/board.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import searchRoutes from './routes/search.routes';
import whiteboardRoutes from './routes/whiteboard.routes';
import assetRoutes from './routes/asset.routes';
import { apiLimiter } from './middleware/rateLimit.middleware';
import { prisma } from './utils/prisma';

import path from 'path';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

console.log("PORT env:", process.env.PORT);
console.log("JWT_SECRET env:", process.env.JWT_SECRET ? "SET" : "NOT SET");
console.log("DATABASE_URL env:", process.env.DATABASE_URL ? "SET" : "NOT SET");

const app = express();
const PORT = process.env.PORT || 5000;

// Trust the first proxy (Render / nginx) so rate limiting sees real client IPs
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Security headers
app.use(helmet({ crossOriginResourcePolicy: false }));

// CORS: comma-separated allowlist via CORS_ORIGIN.
// If not configured, fall back to permissive (dev convenience) and warn in production.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

if (isProd && allowedOrigins.length === 0) {
    console.warn('[WARN] CORS_ORIGIN is not set in production — all origins will be allowed. Set it to your frontend URL.');
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true); // non-browser clients / same-origin
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

// Response compression + body parsing limits
app.use(compression());
// Whiteboard saves carry a full tldraw snapshot, which outgrows 1 MB on a busy
// board. Rather than raise the limit for every route — which widens the surface
// for oversized-body abuse everywhere — only that one route gets headroom.
// Images are uploaded to storage separately, so snapshots hold shapes only.
const jsonDefault = express.json({ limit: '1mb' });
const jsonWhiteboard = express.json({ limit: '5mb' });
const WHITEBOARD_SAVE = /^\/api\/workspaces\/[^/]+\/whiteboards\/[^/]+\/?$/;
app.use((req: Request, res: Response, next: NextFunction) =>
    (req.method === 'PATCH' && WHITEBOARD_SAVE.test(req.path) ? jsonWhiteboard : jsonDefault)(req, res, next),
);
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// HTTP Parameter Pollution protection
app.use(hpp());

app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { maxAge: '7d' }));

if (!isProd) {
    app.use((req: Request, res: Response, next: NextFunction) => {
        console.log(`[REQUEST] ${req.method} ${req.url}`);
        res.on('finish', () => {
            console.log(`[RESPONSE] ${req.method} ${req.url} -> ${res.statusCode}`);
        });
        next();
    });
}

// Health check for Render (excluded from rate limiting below)
app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global API rate limiter
app.use('/api', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces/:workspaceId/boards', boardRoutes);
app.use('/api/workspaces/:workspaceId/whiteboards', whiteboardRoutes);
app.use('/api/workspaces/:workspaceId/assets', assetRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/search', searchRoutes);

// 404 for unknown routes
app.use((_req: Request, res: Response) => {
    res.status(404).json({ message: 'Route not found' });
});

// Global Error Handler — never leak stack traces to clients in production
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    console.error(err.stack || err);

    if (err?.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'File too large' });
    }
    // Multer's other upload errors are client mistakes, not server faults, and
    // used to surface as a 500 "Internal Server Error".
    if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ message: 'Upload one file per request' });
    }
    // Multer rejects blocked extensions before the route handler runs, so this
    // has to be caught here rather than in the individual upload controllers.
    if (err?.message === 'File type not allowed') {
        return res.status(400).json({ message: 'File type not allowed' });
    }
    if (err?.message === 'Not allowed by CORS') {
        return res.status(403).json({ message: 'Origin not allowed' });
    }

    const status = typeof err?.status === 'number' ? err.status : 500;
    res.status(status).json({ message: status < 500 && err?.message ? err.message : 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Timeouts tuned for keep-alive behind load balancers
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Graceful shutdown
const shutdown = (signal: string) => {
    console.log(`${signal} received — shutting down gracefully...`);
    server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
    });
    // Force-exit if connections don't drain in time
    setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep database compute active (prevent Neon from sleeping)
setInterval(async () => {
    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
        console.error('Database heartbeat failed:', err);
    }
}, 4 * 60 * 1000); // Every 4 minutes
