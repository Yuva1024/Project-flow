import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import workspaceRoutes from './routes/workspace.routes';
import boardRoutes from './routes/board.routes';
import notificationRoutes from './routes/notification.routes';
import adminRoutes from './routes/admin.routes';
import { prisma } from './utils/prisma';

import path from 'path';

dotenv.config();

console.log("PORT env:", process.env.PORT);
console.log("JWT_SECRET env:", process.env.JWT_SECRET);
console.log("DATABASE_URL env:", process.env.DATABASE_URL ? "SET" : "NOT SET");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    res.on('finish', () => {
        console.log(`[RESPONSE] ${req.method} ${req.url} -> ${res.statusCode}`);
    });
    next();
});


// Health check for Render
app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/workspaces/:workspaceId/boards', boardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).json({ message: 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Keep database compute active (prevent Neon from sleeping)
setInterval(async () => {
    try {
        await prisma.$executeRawUnsafe('SELECT 1');
        console.log('Database heartbeat sent successfully.');
    } catch (err) {
        console.error('Database heartbeat failed:', err);
    }
}, 4 * 60 * 1000); // Every 4 minutes
