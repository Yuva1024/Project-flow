import { PrismaClient } from '@prisma/client';
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const prisma = new PrismaClient();

const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID || '';
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '';
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || 'projectflowuploads';
const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || '';

const s3Client = accountId && accessKeyId && secretAccessKey
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    })
    : null;

async function streamToBuffer(stream: any): Promise<Buffer> {
    const chunks: any[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function extractKey(url: string): string | null {
    if (url.includes('/attachments/')) {
        return 'attachments/' + url.split('/attachments/').pop();
    }
    if (url.includes('/assets/')) {
        return 'assets/' + url.split('/assets/').pop();
    }
    return null;
}

async function fetchFileBuffer(url: string, key: string | null): Promise<Buffer | null> {
    // 1. Try S3 GetObject if key exists
    if (s3Client && key) {
        try {
            const res = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
            if (res.Body) {
                return await streamToBuffer(res.Body);
            }
        } catch (e: any) {
            console.log(`  Could not fetch via S3 GetObject (${key}): ${e.message}`);
        }
    }

    // 2. Try HTTP fetch
    try {
        const res = await fetch(url);
        if (res.ok) {
            const ab = await res.arrayBuffer();
            return Buffer.from(ab);
        }
    } catch (e: any) {
        console.log(`  Could not fetch via HTTP (${url}): ${e.message}`);
    }

    // 3. Try local filesystem fallback
    if (key) {
        const filename = key.split('/').pop() || key;
        const localPath = path.join(__dirname, '../uploads', filename);
        if (fs.existsSync(localPath)) {
            return fs.readFileSync(localPath);
        }
    }

    return null;
}

async function runMigration() {
    console.log('=====================================================');
    console.log('🚀 Starting Cloudflare R2 Unified Storage Migration');
    console.log('=====================================================');
    console.log(`Target Bucket: ${bucketName}`);
    console.log(`Public URL Prefix: ${publicUrl || '(default R2 endpoint)'}`);
    console.log('-----------------------------------------------------');

    // Fetch all records with legacy paths
    const attachments = await prisma.attachment.findMany({
        where: {
            OR: [
                { fileUrl: { contains: '/attachments/' } },
                { fileUrl: { contains: '/assets/' } }
            ]
        }
    });

    const assets = await prisma.asset.findMany({
        where: {
            OR: [
                { fileUrl: { contains: '/attachments/' } },
                { fileUrl: { contains: '/assets/' } }
            ]
        }
    });

    console.log(`Found ${attachments.length} attachments and ${assets.length} assets with legacy URLs.`);

    // Map unique legacy URLs
    const allUrls = new Set<string>();
    attachments.forEach(a => allUrls.add(a.fileUrl));
    assets.forEach(a => allUrls.add(a.fileUrl));

    console.log(`Total unique files to migrate: ${allUrls.size}\n`);

    if (allUrls.size === 0) {
        console.log('✅ No legacy files found. Bucket is already unified!');
        return;
    }

    let migratedCount = 0;
    let errorCount = 0;
    let oldKeysToDelete: string[] = [];

    for (const oldUrl of allUrls) {
        const oldKey = extractKey(oldUrl);
        console.log(`Processing: ${oldKey || oldUrl}`);

        const buffer = await fetchFileBuffer(oldUrl, oldKey);
        if (!buffer) {
            console.error(`  ❌ Failed to fetch content for ${oldUrl}. Skipping.`);
            errorCount++;
            continue;
        }

        // Calculate SHA-256
        const hash = crypto.createHash('sha256').update(buffer).digest('hex');
        const ext = path.extname(oldUrl.split('?')[0]).toLowerCase();
        const newKey = `files/${hash}${ext}`;
        const newUrl = publicUrl
            ? `${publicUrl.replace(/\/$/, '')}/${newKey}`
            : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${newKey}`;

        let contentType = 'application/octet-stream';
        if (ext === '.glb') contentType = 'model/gltf-binary';
        else if (ext === '.gltf') contentType = 'model/gltf+json';
        else if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) {
            contentType = `image/${ext.replace('.', '') === 'jpg' ? 'jpeg' : ext.replace('.', '')}`;
        } else if (['.mp4', '.webm'].includes(ext)) {
            contentType = `video/${ext.replace('.', '')}`;
        }

        // Check if newKey already exists in R2
        let alreadyInR2 = false;
        if (s3Client) {
            try {
                await s3Client.send(new HeadObjectCommand({ Bucket: bucketName, Key: newKey }));
                alreadyInR2 = true;
                console.log(`  ⚡ Object ${newKey} already exists in R2 (Deduplicated)`);
            } catch (e) {
                // Doesn't exist yet
            }

            if (!alreadyInR2) {
                try {
                    await s3Client.send(new PutObjectCommand({
                        Bucket: bucketName,
                        Key: newKey,
                        Body: buffer,
                        ContentType: contentType,
                    }));
                    console.log(`  ✓ Uploaded to ${newKey}`);
                } catch (uploadErr: any) {
                    console.error(`  ❌ Failed to upload to R2 (${newKey}):`, uploadErr.message);
                    errorCount++;
                    continue;
                }
            }
        }

        // Update database records
        const attUpdate = await prisma.attachment.updateMany({
            where: { fileUrl: oldUrl },
            data: { fileUrl: newUrl }
        });

        const assetUpdate = await prisma.asset.updateMany({
            where: { fileUrl: oldUrl },
            data: { fileUrl: newUrl }
        });

        console.log(`  ✓ Updated DB: ${attUpdate.count} attachments, ${assetUpdate.count} assets pointing to ${newUrl}`);

        if (oldKey && oldKey !== newKey) {
            oldKeysToDelete.push(oldKey);
        }

        migratedCount++;
    }

    // Clean up old objects from Cloudflare R2
    if (s3Client && oldKeysToDelete.length > 0) {
        console.log(`\n🧹 Cleaning up ${oldKeysToDelete.length} legacy objects from Cloudflare R2...`);
        for (const key of oldKeysToDelete) {
            try {
                await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));
                console.log(`  🗑️ Deleted old key: ${key}`);
            } catch (e: any) {
                console.warn(`  ⚠️ Could not delete ${key}: ${e.message}`);
            }
        }
    }

    console.log('\n=====================================================');
    console.log(`🎉 Migration Completed!`);
    console.log(`  Successfully Migrated: ${migratedCount} files`);
    console.log(`  Failed/Skipped:        ${errorCount} files`);
    console.log(`  Old Objects Deleted:   ${oldKeysToDelete.length}`);
    console.log('=====================================================');
}

runMigration()
    .catch(err => {
        console.error('Fatal migration error:', err);
        process.exit(1);
    })
    .finally(() => {
        prisma.$disconnect();
    });
