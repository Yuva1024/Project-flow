import { create } from 'zustand';
import api from '@/lib/api';
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
    updateList: (workspaceId: string, boardId: string, listId: string, title: string) => Promise<void>;
    deleteList: (workspaceId: string, boardId: string, listId: string) => Promise<void>;
    reorderLists: (workspaceId: string, boardId: string, orderedListIds: string[]) => Promise<void>;
    reorderCards: (workspaceId: string, boardId: string, cardId: string, targetListId: string, targetIndex: number) => Promise<void>;
}

export const useBoardStore = create<BoardState>((set, get) => ({
    workspaces: [],
    currentWorkspace: null,
    boards: [],
    currentBoard: null,
    isLoading: false,

    fetchWorkspaces: async () => {
        set({ isLoading: true });
        const { data } = await api.get('/workspaces');
        set({ workspaces: data, isLoading: false });
    },

    setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),

    createWorkspace: async (name) => {
        await api.post('/workspaces', { name });
        await get().fetchWorkspaces();
    },

    updateWorkspace: async (id, name) => {
        await api.patch(`/workspaces/${id}`, { name });
        await get().fetchWorkspaces();
        const current = get().currentWorkspace;
        if (current && current.id === id) {
            set({ currentWorkspace: { ...current, name } });
        }
    },

    deleteWorkspace: async (id) => {
        await api.delete(`/workspaces/${id}`);
        await get().fetchWorkspaces();
        const current = get().currentWorkspace;
        if (current && current.id === id) {
            set({ currentWorkspace: null, boards: [] });
        }
    },

    fetchBoards: async (workspaceId) => {
        const { data } = await api.get(`/workspaces/${workspaceId}/boards`);
        set({ boards: data });
    },

    createBoard: async (workspaceId, title) => {
        await api.post(`/workspaces/${workspaceId}/boards`, { title });
        await get().fetchBoards(workspaceId);
    },

    updateBoard: async (workspaceId, boardId, data) => {
        const { data: updatedBoard } = await api.patch(`/workspaces/${workspaceId}/boards/${boardId}`, data);
        await get().fetchBoards(workspaceId);
        const current = get().currentBoard;
        if (current && current.id === boardId) {
            set({ currentBoard: { ...current, title: updatedBoard.title } });
        }
    },

    deleteBoard: async (workspaceId, boardId) => {
        await api.delete(`/workspaces/${workspaceId}/boards/${boardId}`);
        await get().fetchBoards(workspaceId);
        const current = get().currentBoard;
        if (current && current.id === boardId) {
            set({ currentBoard: null });
        }
    },

    fetchBoard: async (workspaceId, boardId) => {
        set({ isLoading: true });
        const { data } = await api.get(`/workspaces/${workspaceId}/boards/${boardId}`);
        set({ currentBoard: data, isLoading: false });
    },

    updateList: async (workspaceId, boardId, listId, title) => {
        await api.patch(`/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}`, { title });
        await get().fetchBoard(workspaceId, boardId);
    },

    deleteList: async (workspaceId, boardId, listId) => {
        await api.delete(`/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}`);
        await get().fetchBoard(workspaceId, boardId);
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
            set({ currentBoard: { ...board, lists: data } });
        } catch (err) {
            // Revert on failure
            set({ currentBoard: { ...board, lists: oldLists } });
            toast.error("Failed to save list order");
            throw err;
        }
    },

    reorderCards: async (workspaceId, boardId, cardId, targetListId, targetIndex) => {
        const board = get().currentBoard;
        if (!board) return;

        const oldLists = JSON.parse(JSON.stringify(board.lists)) as List[];

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
            set({ currentBoard: { ...board, lists: data } });
        } catch (err) {
            // Revert on failure
            set({ currentBoard: { ...board, lists: oldLists } });
            toast.error("Failed to save card order");
            throw err;
        }
    },
}));
