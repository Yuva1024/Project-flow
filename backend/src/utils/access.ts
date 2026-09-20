import { prisma } from './prisma';

/**
 * Shared authorization helpers.
 *
 * Every board-scoped route is mounted under `/api/workspaces/:workspaceId/boards`,
 * so `workspaceId` and `boardId` always arrive from the URL — i.e. from the caller.
 * Never trust them on their own: each helper re-checks that the requester is a
 * member of that workspace AND that the nested record really belongs to it.
 * Looking a record up by its own id alone lets any authenticated user reach any
 * other workspace's data.
 */

/** Returns the requester's membership row for a workspace, or null. */
export async function getMembership(workspaceId: string, userId: string) {
    if (!workspaceId || !userId) return null;
    return prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
    });
}

/** Verifies the board exists inside a workspace the requester belongs to. */
export async function assertBoardAccess(workspaceId: string, boardId: string, userId: string) {
    const membership = await getMembership(workspaceId, userId);
    if (!membership) return null;

    const board = await prisma.board.findFirst({ where: { id: boardId, workspaceId } });
    if (!board) return null;

    return { board, membership };
}

/** Verifies the card lives on that board, in a workspace the requester belongs to. */
export async function assertCardAccess(
    workspaceId: string,
    boardId: string,
    cardId: string,
    userId: string,
) {
    const membership = await getMembership(workspaceId, userId);
    if (!membership) return null;

    const card = await prisma.card.findFirst({
        where: { id: cardId, list: { board: { id: boardId, workspaceId } } },
    });
    if (!card) return null;

    return { card, membership };
}

/** Verifies the checklist hangs off a card the requester can reach. */
export async function assertChecklistAccess(
    workspaceId: string,
    boardId: string,
    cardId: string,
    checklistId: string,
    userId: string,
) {
    const access = await assertCardAccess(workspaceId, boardId, cardId, userId);
    if (!access) return null;

    const checklist = await prisma.checklist.findFirst({ where: { id: checklistId, cardId } });
    if (!checklist) return null;

    return { ...access, checklist };
}

/** Verifies the checklist item hangs off a checklist on a card the requester can reach. */
export async function assertChecklistItemAccess(
    workspaceId: string,
    boardId: string,
    cardId: string,
    checklistId: string,
    itemId: string,
    userId: string,
) {
    const access = await assertChecklistAccess(workspaceId, boardId, cardId, checklistId, userId);
    if (!access) return null;

    const item = await prisma.checklistItem.findFirst({ where: { id: itemId, checklistId } });
    if (!item) return null;

    return { ...access, item };
}

/** Verifies the label belongs to that board, in a workspace the requester belongs to. */
export async function assertLabelAccess(
    workspaceId: string,
    boardId: string,
    labelId: string,
    userId: string,
) {
    const access = await assertBoardAccess(workspaceId, boardId, userId);
    if (!access) return null;

    const label = await prisma.label.findFirst({ where: { id: labelId, boardId } });
    if (!label) return null;

    return { ...access, label };
}
