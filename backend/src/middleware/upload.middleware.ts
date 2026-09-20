import multer from 'multer';
import path from 'path';

/**
 * Shared upload configuration.
 *
 * Files land on a public R2 bucket, so the same extension policy has to apply
 * everywhere. Board attachments used to block executables while the asset
 * library and whiteboard uploads accepted anything — a file rejected on a card
 * could simply be uploaded through the library instead.
 */
export const BLOCKED_EXTENSIONS = [
    '.exe', '.msi', '.bat', '.cmd', '.sh', '.scr', '.com',
    '.ps1', '.vbs', '.jar', '.dll', '.app', '.deb', '.rpm',
    '.htm', '.html', '.svg', '.xhtml',
];

export const MAX_ATTACHMENT_SIZE = 50 * 1024 * 1024;   // 50 MB — card attachments
export const MAX_ASSET_SIZE = 250 * 1024 * 1024;       // 250 MB — 3D library assets
export const MAX_WHITEBOARD_SIZE = 10 * 1024 * 1024;   // 10 MB — inline canvas images

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
        return cb(new Error('File type not allowed'));
    }
    cb(null, true);
};

/**
 * Builds an in-memory single-file upload handler.
 *
 * Everything is buffered in RAM so the SHA-256 content hash can be computed
 * before the bytes are written to R2 — keep `fileSize` in mind when raising it,
 * since concurrent uploads multiply against the process memory limit.
 */
export const createUpload = (maxBytes: number) =>
    multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: maxBytes, files: 1 },
        fileFilter,
    });
