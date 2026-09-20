import { prisma } from './prisma';
import { deleteFiles } from './s3';

/**
 * Reference-counted deletion for Content-Addressable Storage.
 *
 * Files live in R2 under `files/<sha256>.<ext>`, so a single object is shared by
 * EVERY Attachment/Asset row whose contents hash the same. Deleting an object
 * because one owner went away breaks every other card and library asset that
 * still points at it — their rows survive but the download 404s.
 *
 * Always call this AFTER the owning rows have been removed from the database.
 * By then the cascade has cleared the dead references, so anything still
 * pointing at a URL is a live reference that must keep the bytes alive. If the
 * database delete fails, nothing has been removed from storage yet.
 */
export async function deleteUnreferencedFiles(fileUrls: string[]): Promise<void> {
    const candidates = Array.from(new Set(fileUrls.filter(Boolean)));
    if (candidates.length === 0) return;

    try {
        const [attachments, assets] = await Promise.all([
            prisma.attachment.findMany({
                where: { fileUrl: { in: candidates } },
                select: { fileUrl: true },
            }),
            prisma.asset.findMany({
                where: { fileUrl: { in: candidates } },
                select: { fileUrl: true },
            }),
        ]);

        const stillReferenced = new Set<string>([
            ...attachments.map(a => a.fileUrl),
            ...assets.map(a => a.fileUrl),
        ]);

        const orphaned = candidates.filter(url => !stillReferenced.has(url));
        const shared = candidates.length - orphaned.length;
        if (shared > 0) {
            console.log(`[CAS] Keeping ${shared} shared file(s) still referenced elsewhere.`);
        }

        if (orphaned.length > 0) {
            await deleteFiles(orphaned);
        }
    } catch (error) {
        // Storage cleanup must never fail the request that triggered it — the
        // database change has already committed. Worst case we leak an object.
        console.error('[CAS] Failed to clean up unreferenced files:', error);
    }
}

/** Collects every attachment URL reachable from a set of board ids. */
export async function collectBoardFileUrls(boardIds: string[]): Promise<string[]> {
    if (boardIds.length === 0) return [];
    const attachments = await prisma.attachment.findMany({
        where: { card: { list: { boardId: { in: boardIds } } } },
        select: { fileUrl: true },
    });
    return attachments.map(a => a.fileUrl);
}

/** Collects every attachment + library asset URL inside a workspace. */
export async function collectWorkspaceFileUrls(workspaceId: string): Promise<string[]> {
    const [attachments, assets] = await Promise.all([
        prisma.attachment.findMany({
            where: { card: { list: { board: { workspaceId } } } },
            select: { fileUrl: true },
        }),
        prisma.asset.findMany({
            where: { workspaceId },
            select: { fileUrl: true },
        }),
    ]);
    return [...attachments.map(a => a.fileUrl), ...assets.map(a => a.fileUrl)];
}
