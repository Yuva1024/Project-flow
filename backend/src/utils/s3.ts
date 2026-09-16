import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

let cachedS3Client: S3Client | null | undefined;

const getS3Client = () => {
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

export const uploadFile = async (file: Express.Multer.File): Promise<{ fileUrl: string; key: string }> => {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
    const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || '';

    const s3Client = getS3Client();
    const fileExt = path.extname(file.originalname);
    const uniqueKey = `attachments/${Date.now()}-${Math.random().toString(36).substring(2, 9)}${fileExt}`;

    let contentType = file.mimetype;
    if (fileExt.toLowerCase() === '.glb') contentType = 'model/gltf-binary';
    if (fileExt.toLowerCase() === '.gltf') contentType = 'model/gltf+json';

    if (s3Client && bucketName) {
        try {
            await s3Client.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: uniqueKey,
                    Body: file.buffer,
                    ContentType: contentType,
                })
            );

            // Construct public URL
            const url = publicUrl
                ? `${publicUrl.replace(/\/$/, '')}/${uniqueKey}`
                : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${uniqueKey}`;

            console.log('Successfully uploaded file to Cloudflare R2:', url);
            return { fileUrl: url, key: uniqueKey };
        } catch (error) {
            console.error('Cloudflare R2 upload error, falling back to local storage:', error);
        }
    }

    // Fallback to local storage if R2 is not configured or fails
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}${fileExt}`;
    const localPath = path.join(uploadDir, filename);
    fs.writeFileSync(localPath, file.buffer);

    const port = process.env.PORT || 5000;
    const backendUrl = process.env.BACKEND_URL ? process.env.BACKEND_URL.replace(/\/$/, '') : `http://localhost:${port}`;
    const localUrl = `${backendUrl}/uploads/${filename}`;
    return { fileUrl: localUrl, key: filename };
};

export const uploadAssetFile = async (file: Express.Multer.File): Promise<{ fileUrl: string; key: string }> => {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
    const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || '';

    const s3Client = getS3Client();
    const fileExt = path.extname(file.originalname);
    const uniqueKey = `assets/${Date.now()}-${Math.random().toString(36).substring(2, 9)}${fileExt}`;

    let contentType = file.mimetype;
    if (fileExt.toLowerCase() === '.glb') contentType = 'model/gltf-binary';
    if (fileExt.toLowerCase() === '.gltf') contentType = 'model/gltf+json';

    if (s3Client && bucketName) {
        try {
            await s3Client.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: uniqueKey,
                    Body: file.buffer,
                    ContentType: contentType,
                })
            );

            // Construct public URL
            const url = publicUrl
                ? `${publicUrl.replace(/\/$/, '')}/${uniqueKey}`
                : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${uniqueKey}`;

            console.log('Successfully uploaded asset file to Cloudflare R2:', url);
            return { fileUrl: url, key: uniqueKey };
        } catch (error) {
            console.error('Cloudflare R2 upload error, falling back to local storage:', error);
        }
    }

    // Fallback to local storage if R2 is not configured or fails
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filename = `asset-${Date.now()}-${Math.random().toString(36).substring(2, 9)}${fileExt}`;
    const localPath = path.join(uploadDir, filename);
    fs.writeFileSync(localPath, file.buffer);

    const port = process.env.PORT || 5000;
    const backendUrl = process.env.BACKEND_URL ? process.env.BACKEND_URL.replace(/\/$/, '') : `http://localhost:${port}`;
    const localUrl = `${backendUrl}/uploads/${filename}`;
    return { fileUrl: localUrl, key: filename };
};

export const deleteFile = async (urlOrKey: string): Promise<void> => {
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
    const s3Client = getS3Client();

    let key = urlOrKey;
    if (urlOrKey.includes('/attachments/')) {
        key = 'attachments/' + urlOrKey.split('/attachments/').pop();
    } else if (urlOrKey.includes('/assets/')) {
        key = 'assets/' + urlOrKey.split('/assets/').pop();
    }

    if (s3Client && bucketName && (key.startsWith('attachments/') || key.startsWith('assets/'))) {
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
        }
        return url;
    }).filter(key => key.startsWith('attachments/') || key.startsWith('assets/'));

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
            // R2 deletion succeeded — no need to touch the local filesystem
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
