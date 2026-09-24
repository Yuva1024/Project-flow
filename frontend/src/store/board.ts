import { create } from 'zustand';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import toast from 'react-hot-toast';

interface Workspace {
    id: string;
    name: string;
    ownerId: string;
    owner: { id: string; name: string; email: string };
    _count: { members: number; boards: number };
}

interface Board {
    id: string;
    title: string;
    visibility: string;
    workspaceId: string;
    _count?: { lists: number };
}

export interface Whiteboard {
    id: string;
    name: string;
    workspaceId: string;
    elements: any;
    updatedAt: string;
}

export interface Card {
    id: string;
    listId: string;
    title: string;
    description?: string;
    priority?: string;
    dueDate?: string;
    position: number;
    createdBy: string;
    creator?: { id: string; name: string; email: string };
    labels?: { cardId: string; labelId: string; label: { id: string; name: string; color: string } }[];
    members?: { cardId: string; userId: string; user: { id: string; name: string; avatarUrl?: string } }[];
    model3DSections?: { id: string; title: string; modelUrl: string; autoRotate?: boolean; attachmentId?: string }[];
}

export interface List {
    id: string;
    boardId: string;
    title: string;
    position: number;
    cards: Card[];
}

interface BoardState {
    workspaces: Workspace[];
    currentWorkspace: Workspace | null;
    boards: Board[];
    whiteboards: Whiteboard[];
    currentBoard: { id: string; title: string; lists: List[] } | null;
    isLoading: boolean;

    fetchWorkspaces: () => Promise<void>;
    setCurrentWorkspace: (ws: Workspace) => void;
    createWorkspace: (name: string) => Promise<void>;
    updateWorkspace: (id: string, name: string) => Promise<void>;
    deleteWorkspace: (id: string) => Promise<void>;
    
    fetchBoards: (workspaceId: string) => Promise<void>;
    createBoard: (workspaceId: string, title: string) => Promise<void>;
    updateBoard: (workspaceId: string, boardId: string, data: { title?: string; visibility?: string }) => Promise<void>;
    deleteBoard: (workspaceId: string, boardId: string) => Promise<void>;
    fetchBoard: (workspaceId: string, boardId: string) => Promise<void>;
    
    fetchWhiteboards: (workspaceId: string) => Promise<void>;
    createWhiteboard: (workspaceId: string, name: string) => Promise<void>;
    deleteWhiteboard: (workspaceId: string, wbId: string) => Promise<void>;
    updateList: (workspaceId: string, boardId: string, listId: string, title: string) => Promise<void>;
    deleteList: (workspaceId: string, boardId: string, listId: string) => Promise<void>;
    addList: (workspaceId: string, boardId: string, title: string) => Promise<void>;
    addCard: (workspaceId: string, boardId: string, listId: string, title: string) => Promise<void>;
    removeCard: (workspaceId: string, boardId: string, cardId: string) => Promise<void>;
    reorderLists: (workspaceId: string, boardId: string, orderedListIds: string[]) => Promise<void>;
    reorderCards: (workspaceId: string, boardId: string, cardId: string, targetListId: string, targetIndex: number) => Promise<void>;
}

export const useBoardStore = create<BoardState>((set, get) => ({
    workspaces: [],
    currentWorkspace: null,
    boards: [],
    currentBoard: null,
    whiteboards: [],
    isLoading: false,

    fetchWorkspaces: async () => {
        set({ isLoading: true });
        try {
            const { data } = await api.get('/workspaces');
            set({ workspaces: Array.isArray(data) ? data : [] });
        } finally {
            // Without the finally, any failure left the dashboard spinner up forever.
            set({ isLoading: false });
        }
    },

    setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),

    // Every mutation below updates local state first and only then talks to the
    // server. They used to await the request and then refetch the whole list —
    // two sequential round trips per click, which is what made buttons feel
    // slow. Now the screen changes immediately; on failure only the affected
    // item is put back, so a concurrent change elsewhere is not clobbered.
    // Errors are rethrown for the caller to report, as before.

    createWorkspace: async (name) => {
        const { data } = await api.post('/workspaces', { name });
        const me = useAuthStore.getState().user;
        // The create response is the bare row. The list view also shows owner
        // and counts, which are fully determined for a brand-new workspace.
        const entry: Workspace = {
            ...data,
            owner: me ? { id: me.id, name: me.name, email: me.email } : data.owner,
            _count: { members: 1, boards: 0 },
        };
        set({ workspaces: [entry, ...get().workspaces.filter(w => w.id !== entry.id)] });
    },

    updateWorkspace: async (id, name) => {
        const previous = get().workspaces.find(w => w.id === id)?.name;
        const rename = (value: string) => {
            set({ workspaces: get().workspaces.map(w => (w.id === id ? { ...w, name: value } : w)) });
            const current = get().currentWorkspace;
            if (current?.id === id) set({ currentWorkspace: { ...current, name: value } });
        };

        rename(name);
        try {
            await api.patch(`/workspaces/${id}`, { name });
        } catch (err) {
            if (previous !== undefined) rename(previous);
            throw err;
        }
    },

    deleteWorkspace: async (id) => {
        const list = get().workspaces;
        const index = list.findIndex(w => w.id === id);
        const removed = list[index];
        const wasCurrent = get().currentWorkspace?.id === id;
        const previousBoards = get().boards;

        set({ workspaces: list.filter(w => w.id !== id) });
        if (wasCurrent) set({ currentWorkspace: null, boards: [] });

        try {
            await api.delete(`/workspaces/${id}`);
        } catch (err) {
            if (removed && !get().workspaces.some(w => w.id === id)) {
                const next = [...get().workspaces];
                next.splice(Math.min(index, next.length), 0, removed);
                set({ workspaces: next });
                if (wasCurrent) set({ currentWorkspace: removed, boards: previousBoards });
            }
            throw err;
        }
    },

    fetchBoards: async (workspaceId) => {
        const { data } = await api.get(`/workspaces/${workspaceId}/boards`);
        set({ boards: Array.isArray(data) ? data : [] });
    },

    createBoard: async (workspaceId, title) => {
        const { data } = await api.post(`/workspaces/${workspaceId}/boards`, { title });
        // The list is newest-first, and a new board has no sections yet.
        const entry: Board = { ...data, _count: { lists: 0 } };
        set({ boards: [entry, ...get().boards.filter(b => b.id !== entry.id)] });
    },

    updateBoard: async (workspaceId, boardId, data) => {
        const before = get().boards.find(b => b.id === boardId);
        const beforeCurrent = get().currentBoard;

        const apply = (patch: { title?: string; visibility?: string }) => {
            set({ boards: get().boards.map(b => (b.id === boardId ? { ...b, ...patch } : b)) });
            const current = get().currentBoard;
            if (current?.id === boardId && patch.title !== undefined) {
                set({ currentBoard: { ...current, title: patch.title } });
            }
        };

        apply(data);
        try {
            await api.patch(`/workspaces/${workspaceId}/boards/${boardId}`, data);
        } catch (err) {
            if (before) apply({ title: before.title, visibility: before.visibility });
            else if (beforeCurrent?.id === boardId) apply({ title: beforeCurrent.title });
            throw err;
        }
    },

    deleteBoard: async (workspaceId, boardId) => {
        const list = get().boards;
        const index = list.findIndex(b => b.id === boardId);
        const removed = list[index];
        const current = get().currentBoard;

        set({ boards: list.filter(b => b.id !== boardId) });
        if (current?.id === boardId) set({ currentBoard: null });

        try {
            await api.delete(`/workspaces/${workspaceId}/boards/${boardId}`);
        } catch (err) {
            if (removed && !get().boards.some(b => b.id === boardId)) {
                const next = [...get().boards];
                next.splice(Math.min(index, next.length), 0, removed);
                set({ boards: next });
            }
            if (current?.id === boardId) set({ currentBoard: current });
            throw err;
        }
    },

    fetchWhiteboards: async (workspaceId) => {
        const { data } = await api.get(`/workspaces/${workspaceId}/whiteboards`);
        set({ whiteboards: Array.isArray(data) ? data : [] });
    },

    createWhiteboard: async (workspaceId, name) => {
        const { data } = await api.post(`/workspaces/${workspaceId}/whiteboards`, { name });
        const entry = { ...data, workspaceId } as Whiteboard;
        set({ whiteboards: [entry, ...get().whiteboards.filter(w => w.id !== entry.id)] });
    },

    deleteWhiteboard: async (workspaceId, wbId) => {
        const list = get().whiteboards;
        const index = list.findIndex(w => w.id === wbId);
        const removed = list[index];

        set({ whiteboards: list.filter(w => w.id !== wbId) });
        try {
            await api.delete(`/workspaces/${workspaceId}/whiteboards/${wbId}`);
        } catch (err) {
            if (removed && !get().whiteboards.some(w => w.id === wbId)) {
                const next = [...get().whiteboards];
                next.splice(Math.min(index, next.length), 0, removed);
                set({ whiteboards: next });
            }
            throw err;
        }
    },

    fetchBoard: async (workspaceId, boardId) => {
        // Only show the full-screen loader for an initial load or a board switch;
        // background refreshes (e.g. after closing a card modal) stay silent.
        const isNewBoard = get().currentBoard?.id !== boardId;
        if (isNewBoard) set({ isLoading: true });
        try {
            const { data } = await api.get(`/workspaces/${workspaceId}/boards/${boardId}`);
            set({ currentBoard: data });
        } finally {
            if (isNewBoard) set({ isLoading: false });
        }
    },

    updateList: async (workspaceId, boardId, listId, title) => {
        // Renaming used to refetch the entire board — every section, card,
        // label and member — to change one string.
        const board = get().currentBoard;
        const previous = board?.lists.find(l => l.id === listId)?.title;

        const rename = (value: string) => {
            const latest = get().currentBoard;
            if (latest?.id !== boardId) return;
            set({
                currentBoard: {
                    ...latest,
                    lists: latest.lists.map(l => (l.id === listId ? { ...l, title: value } : l)),
                },
            });
        };

        rename(title);
        try {
            await api.patch(`/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}`, { title });
        } catch (err) {
            if (previous !== undefined) rename(previous);
            throw err;
        }
    },

    deleteList: async (workspaceId, boardId, listId) => {
        const board = get().currentBoard;
        if (!board || board.id !== boardId) {
            await api.delete(`/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}`);
            return;
        }

        const index = board.lists.findIndex(l => l.id === listId);
        const removed = board.lists[index];

        set({ currentBoard: { ...board, lists: board.lists.filter(l => l.id !== listId) } });
        try {
            await api.delete(`/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}`);
        } catch (err) {
            const latest = get().currentBoard;
            if (removed && latest?.id === boardId && !latest.lists.some(l => l.id === listId)) {
                const lists = [...latest.lists];
                lists.splice(Math.min(index, lists.length), 0, removed);
                set({ currentBoard: { ...latest, lists } });
            }
            throw err;
        }
    },

    // The create endpoints return the new row, so it can be placed directly
    // instead of refetching the whole board — which pulls every section, card,
    // label and member to show one new item.

    addList: async (workspaceId, boardId, title) => {
        const { data } = await api.post(`/workspaces/${workspaceId}/boards/${boardId}/lists`, { title });
        const latest = get().currentBoard;
        if (latest?.id !== boardId) return;
        const list: List = { ...data, cards: [] };
        const lists = [...latest.lists.filter(l => l.id !== list.id), list]
            .sort((a, b) => a.position - b.position);
        set({ currentBoard: { ...latest, lists } });
    },

    addCard: async (workspaceId, boardId, listId, title) => {
        const { data } = await api.post(
            `/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}/cards`,
            { title },
        );
        const latest = get().currentBoard;
        if (latest?.id !== boardId) return;
        // A brand-new card has no labels, members, attachments or comments, so
        // the fields the board payload normally carries are known exactly.
        const card = { ...data, labels: [], members: [], _count: { attachments: 0, comments: 0 } } as Card;
        set({
            currentBoard: {
                ...latest,
                lists: latest.lists.map(l =>
                    l.id === listId
                        ? { ...l, cards: [...l.cards.filter(c => c.id !== card.id), card].sort((a, b) => a.position - b.position) }
                        : l,
                ),
            },
        });
    },

    removeCard: async (workspaceId, boardId, cardId) => {
        const board = get().currentBoard;
        let owner: string | null = null;
        let index = -1;
        let removed: Card | undefined;

        if (board?.id === boardId) {
            for (const l of board.lists) {
                const i = l.cards.findIndex(c => c.id === cardId);
                if (i !== -1) { owner = l.id; index = i; removed = l.cards[i]; break; }
            }
            set({
                currentBoard: {
                    ...board,
                    lists: board.lists.map(l => ({ ...l, cards: l.cards.filter(c => c.id !== cardId) })),
                },
            });
        }

        try {
            await api.delete(`/workspaces/${workspaceId}/boards/${boardId}/cards/${cardId}`);
        } catch (err) {
            const latest = get().currentBoard;
            if (removed && owner && latest?.id === boardId) {
                set({
                    currentBoard: {
                        ...latest,
                        lists: latest.lists.map(l => {
                            if (l.id !== owner || l.cards.some(c => c.id === cardId)) return l;
                            const cards = [...l.cards];
                            cards.splice(Math.min(index, cards.length), 0, removed!);
                            return { ...l, cards };
                        }),
                    },
                });
            }
            throw err;
        }
    },

    reorderLists: async (workspaceId, boardId, orderedListIds) => {
        const board = get().currentBoard;
        if (!board) return;

        // 1. Optimistic Update
        const oldLists = [...board.lists];
        const newLists = orderedListIds
            .map(id => board.lists.find(l => l.id === id))
            .filter(Boolean) as List[];
        
        set({ currentBoard: { ...board, lists: newLists } });

        try {
            const { data } = await api.put(`/workspaces/${workspaceId}/boards/${boardId}/lists/reorder`, { orderedListIds });
            const latest = get().currentBoard;
            if (latest?.id !== boardId) return; // user navigated away mid-flight
            set({ currentBoard: { ...latest, lists: data } });
        } catch (err) {
            // Revert on failure
            const latest = get().currentBoard;
            if (latest?.id === boardId) set({ currentBoard: { ...latest, lists: oldLists } });
            toast.error("Failed to save list order");
            throw err;
        }
    },

    reorderCards: async (workspaceId, boardId, cardId, targetListId, targetIndex) => {
        const board = get().currentBoard;
        if (!board) return;

        const oldLists = structuredClone(board.lists);

        // 1. Find the card and its source list
        let cardToMove: Card | null = null;
        let sourceListId = "";
        for (const list of board.lists) {
            const card = list.cards.find(c => c.id === cardId);
            if (card) {
                cardToMove = card;
                sourceListId = list.id;
                break;
            }
        }

        if (!cardToMove) return;

        // 2. Create optimistic new list structures
        const newLists = board.lists.map(list => {
            if (list.id === sourceListId && list.id === targetListId) {
                const listCards = list.cards.filter(c => c.id !== cardId);
                listCards.splice(targetIndex, 0, { ...cardToMove!, listId: targetListId });
                return { ...list, cards: listCards };
            } else if (list.id === sourceListId) {
                return { ...list, cards: list.cards.filter(c => c.id !== cardId) };
            } else if (list.id === targetListId) {
                const listCards = [...list.cards];
                listCards.splice(targetIndex, 0, { ...cardToMove!, listId: targetListId });
                return { ...list, cards: listCards };
            }
            return list;
        });

        // 3. Apply optimistic state
        set({ currentBoard: { ...board, lists: newLists } });

        try {
            const { data } = await api.put(`/workspaces/${workspaceId}/boards/${boardId}/cards/reorder`, { cardId, targetListId, targetIndex });
            const latest = get().currentBoard;
            if (latest?.id !== boardId) return; // user navigated away mid-flight
            set({ currentBoard: { ...latest, lists: data } });
        } catch (err) {
            // Revert on failure
            const latest = get().currentBoard;
            if (latest?.id === boardId) set({ currentBoard: { ...latest, lists: oldLists } });
            toast.error("Failed to save card order");
            throw err;
        }
    },
}));
