import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../utils/prisma';

const registerSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
});

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

const ADMIN_EMAIL = 'admin123@gmail.com';
const ADMIN_PASSWORD = '123456';
const RECOVERY_CODE = 'email1234';

export const register = async (req: Request, res: Response) => {
    try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const { name, email, password } = parsed.data;

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { name, email, passwordHash },
        });

        const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

        res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const { email, password } = parsed.data;

        // Admin auto-creation: if admin email is used, auto-create or verify
        if (email === ADMIN_EMAIL) {
            let adminUser = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

            if (!adminUser) {
                // Auto-create the admin account
                const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
                adminUser = await prisma.user.create({
                    data: {
                        name: 'Admin',
                        email: ADMIN_EMAIL,
                        passwordHash,
                        isAdmin: true,
                    },
                });
            }

            // Ensure admin flag is set
            if (!adminUser.isAdmin) {
                adminUser = await prisma.user.update({
                    where: { id: adminUser.id },
                    data: { isAdmin: true },
                });
            }

            const isMatch = await bcrypt.compare(password, adminUser.passwordHash);
            if (!isMatch) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            const token = jwt.sign({ userId: adminUser.id, isAdmin: true }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
            return res.json({ token, user: { id: adminUser.id, name: adminUser.name, email: adminUser.email, isAdmin: true } });
        }

        // Regular user login
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

        res.json({ token, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

// Forgot Password Recovery using master recovery code
export const recoverAccount = async (req: Request, res: Response) => {
    try {
        const { email, recoveryCode, newPassword } = req.body;

        if (!email || !recoveryCode || !newPassword) {
            return res.status(400).json({ message: 'Email, recovery code, and new password are required' });
        }

        if (recoveryCode !== RECOVERY_CODE) {
            return res.status(403).json({ message: 'Invalid recovery code' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: 'No account found with this email' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: newHash },
        });

        // Auto-login after password reset
        const token = jwt.sign({ userId: user.id, isAdmin: user.isAdmin }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });

        res.json({
            message: 'Password reset successfully',
            token,
            user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin },
        });
    } catch (error) {
        console.error('recoverAccount error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

import { AuthRequest } from '../middleware/auth.middleware';

const updateProfileSchema = z.object({
    name: z.string().min(2).optional(),
    avatarUrl: z.string().url().or(z.string().length(0)).nullable().optional(),
});

const changePasswordSchema = z.object({
    oldPassword: z.string(),
    newPassword: z.string().min(6),
});

export const getMe = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        console.log("[DEBUG] getMe userId:", userId);
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
                isAdmin: true,
                createdAt: true,
            }
        });

        console.log("[DEBUG] getMe user found:", user ? "YES" : "NO");

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ user });
    } catch (error) {
        console.error('getMe error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const parsed = updateProfileSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const { name, avatarUrl } = parsed.data;

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(name !== undefined && { name }),
                ...(avatarUrl !== undefined && { avatarUrl }),
            },
            select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
                isAdmin: true,
            }
        });

        res.json({ user: updatedUser });
    } catch (error) {
        console.error('updateProfile error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const parsed = changePasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid input', errors: parsed.error.format() });
        }

        const { oldPassword, newPassword } = parsed.data;

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ message: 'Incorrect old password' });
        }

        const newHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newHash },
        });

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error('changePassword error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
