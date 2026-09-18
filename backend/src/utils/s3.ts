import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

let cachedS3Client: S3Client | null | undefined;

export const getS3Client = () => {
    if (cachedS3Client !== undefined) return cachedS3Client;

    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';

    cachedS3Client = accountId && accessKeyId && secretAccessKey
        ? new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        })
        : null;
    return cachedS3Client;
};

export const computeFileHash = (buffer: Buffer): string => {
    return crypto.createHash('sha256').update(buffer).digest('hex');
};

/**
 * Unified file upload utilizing Content-Addressable Storage (CAS) with SHA-256 deduplication.
 * Files are stored under the unified prefix `files/<sha256>.<ext>`.
 * If the exact same file content was previously uploaded (from any card or the asset library),
 * Cloudflare R2 immediately reuses the existing object without re-uploading duplicate bytes.
 */
export const uploadUnifiedFile = async (file: Express.Multer.File): Promise<{ fileUrl: string; key: string; isDuplicate?: boolean }> => {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
    const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || '';

    const s3Client = getS3Client();
    const fileExt = path.extname(file.originalname).toLowerCase();
    const hash = computeFileHash(file.buffer);
    const uniqueKey = `files/${hash}${fileExt}`;

    let contentType = file.mimetype;
    if (fileExt === '.glb') contentType = 'model/gltf-binary';
    if (fileExt === '.gltf') contentType = 'model/gltf+json';

    const url = publicUrl
        ? `${publicUrl.replace(/\/$/, '')}/${uniqueKey}`
        : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${uniqueKey}`;

    if (s3Client && bucketName) {
        try {
            // Check if file already exists in Cloudflare R2 to avoid redundant network transfer
            try {
                await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: uniqueKey }));
                console.log(`[CAS Deduplication] File ${uniqueKey} already exists in R2. Reusing existing object.`);
                return { fileUrl: url, key: uniqueKey, isDuplicate: true };
            } catch (headErr: any) {
                // Object does not exist in R2 — proceed to upload
            }

            await s3Client.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: uniqueKey,
                    Body: file.buffer,
                    ContentType: contentType,
                })
            );

            console.log('Successfully uploaded unified file to Cloudflare R2:', url);
            return { fileUrl: url, key: uniqueKey, isDuplicate: false };
        } catch (error) {
            console.error('Cloudflare R2 upload error, falling back to local storage:', error);
        }
    }

    // Fallback to local storage if R2 is not configured or fails
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${hash}${fileExt}`;
    const localPath = path.join(uploadDir, filename);
    const exists = fs.existsSync(localPath);
    if (!exists) {
        fs.writeFileSync(localPath, file.buffer);
    }

    const port = process.env.PORT || 5000;
    const backendUrl = process.env.BACKEND_URL ? process.env.BACKEND_URL.replace(/\/$/, '') : `http://localhost:${port}`;
    const localUrl = `${backendUrl}/uploads/${filename}`;
    return { fileUrl: localUrl, key: filename, isDuplicate: exists };
};

// Aliases for backwards compatibility with existing callers
export const uploadFile = async (file: Express.Multer.File) => uploadUnifiedFile(file);
export const uploadAssetFile = async (file: Express.Multer.File) => uploadUnifiedFile(file);

export const deleteFile = async (urlOrKey: string): Promise<void> => {
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
    const s3Client = getS3Client();

    let key = urlOrKey;
    if (urlOrKey.includes('/attachments/')) {
        key = 'attachments/' + urlOrKey.split('/attachments/').pop();
    } else if (urlOrKey.includes('/assets/')) {
        key = 'assets/' + urlOrKey.split('/assets/').pop();
    } else if (urlOrKey.includes('/files/')) {
        key = 'files/' + urlOrKey.split('/files/').pop();
    }

    if (s3Client && bucketName && (key.startsWith('attachments/') || key.startsWith('assets/') || key.startsWith('files/'))) {
        try {
            await s3Client.send(
                new DeleteObjectCommand({
                    Bucket: bucketName,
                    Key: key,
                })
            );
            return;
        } catch (error) {
            console.error('Error deleting file from R2:', error);
        }
    }

    // Local fallback deletion
    const filename = key.split('/').pop() || key;
    const localPath = path.join(__dirname, '../../uploads', filename);
    if (fs.existsSync(localPath)) {
        try {
            fs.unlinkSync(localPath);
        } catch (err) {
            console.error('Error deleting local file:', err);
        }
    }
};

export const deleteFiles = async (urlsOrKeys: string[]): Promise<void> => {
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
    const s3Client = getS3Client();

    const keys = urlsOrKeys.map(url => {
        if (url.includes('/attachments/')) {
            return 'attachments/' + url.split('/attachments/').pop();
        } else if (url.includes('/assets/')) {
            return 'assets/' + url.split('/assets/').pop();
        } else if (url.includes('/files/')) {
            return 'files/' + url.split('/files/').pop();
        }
        return url;
    }).filter(key => key.startsWith('attachments/') || key.startsWith('assets/') || key.startsWith('files/'));

    if (s3Client && bucketName && keys.length > 0) {
        try {
            const chunks = [];
            for (let i = 0; i < keys.length; i += 1000) {
                chunks.push(keys.slice(i, i + 1000));
            }
            
            for (const chunk of chunks) {
                await s3Client.send(
                    new DeleteObjectsCommand({
                        Bucket: bucketName,
                        Delete: {
                            Objects: chunk.map(key => ({ Key: key })),
                        },
                    })
                );
            }
            return;
        } catch (error) {
            console.error('Error deleting multiple files from R2:', error);
        }
    }

    // Local fallback deletion
    for (const url of urlsOrKeys) {
        const filename = url.split('/').pop() || url;
        const localPath = path.join(__dirname, '../../uploads', filename);
        if (fs.existsSync(localPath)) {
            try { fs.unlinkSync(localPath); } catch (e) {}
        }
    }
};
