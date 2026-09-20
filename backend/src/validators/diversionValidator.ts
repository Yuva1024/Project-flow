import { z } from 'zod';

export const sendToDiversionSchema = z.object({
    repoId: z.string().trim().min(1, 'Diversion Repository ID is required'),
    branch: z.string().trim().optional().default('main'),
    targetPath: z.string().trim().min(1, 'Target path is required'),
    commitMessage: z.string().trim().optional(),
    apiKey: z.string().trim().optional(),
});

export const listReposSchema = z.object({
    apiKey: z.string().trim().optional(),
});

export const listFoldersSchema = z.object({
    repoId: z.string().trim().min(1, 'Repository ID is required'),
    branch: z.string().trim().optional().default('main'),
    apiKey: z.string().trim().optional(),
});

export type SendToDiversionInput = z.infer<typeof sendToDiversionSchema>;
export type ListReposInput = z.infer<typeof listReposSchema>;
export type ListFoldersInput = z.infer<typeof listFoldersSchema>;
