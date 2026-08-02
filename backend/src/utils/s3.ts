import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const getS3Client = () => {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || 'bc9ca9b973b908a0351c291edef0ceb7';
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';

    if (accountId && accessKeyId && secretAccessKey) {
        return new S3Client({
            region: 'auto',
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });
    }
    return null;
};

export const uploadFile = async (file: Express.Multer.File): Promise<{ fileUrl: string; key: string }> => {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || 'bc9ca9b973b908a0351c291edef0ceb7';
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
    const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || 'https://pub-ccb200eead884efbac751122dac022ed.r2.dev';

    const s3Client = getS3Client();
    const fileExt = path.extname(file.originalname);
    const uniqueKey = `attachments/${Date.now()}-${Math.random().toString(36).substring(2, 9)}${fileExt}`;

    if (s3Client && bucketName) {
        try {
            await s3Client.send(
                new PutObjectCommand({
                    Bucket: bucketName,
                    Key: uniqueKey,
                    Body: file.buffer,
                    ContentType: file.mimetype,
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
    const localUrl = `http://localhost:${port}/uploads/${filename}`;
    return { fileUrl: localUrl, key: filename };
};

export const deleteFile = async (key: string): Promise<void> => {
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
    const s3Client = getS3Client();

    if (s3Client && bucketName && key.startsWith('attachments/')) {
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
    const localPath = path.join(__dirname, '../../uploads', key);
    if (fs.existsSync(localPath)) {
        try {
            fs.unlinkSync(localPath);
        } catch (err) {
            console.error('Error deleting local file:', err);
        }
    }
};
