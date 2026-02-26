import { create } from 'zustand';
import api from '@/lib/api';

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
    fetchBoards: (workspaceId: string) => Promise<void>;
    createBoard: (workspaceId: string, title: string) => Promise<void>;
    fetchBoard: (workspaceId: string, boardId: string) => Promise<void>;
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

    fetchBoards: async (workspaceId) => {
        const { data } = await api.get(`/workspaces/${workspaceId}/boards`);
        set({ boards: data });
    },

    createBoard: async (workspaceId, title) => {
        await api.post(`/workspaces/${workspaceId}/boards`, { title });
        await get().fetchBoards(workspaceId);
    },

    fetchBoard: async (workspaceId, boardId) => {
        set({ isLoading: true });
        const { data } = await api.get(`/workspaces/${workspaceId}/boards/${boardId}`);
        set({ currentBoard: data, isLoading: false });
    },

    reorderLists: async (workspaceId, boardId, orderedListIds) => {
        const { data } = await api.put(`/workspaces/${workspaceId}/boards/${boardId}/lists/reorder`, { orderedListIds });
        const board = get().currentBoard;
        if (board) set({ currentBoard: { ...board, lists: data } });
    },

    reorderCards: async (workspaceId, boardId, cardId, targetListId, targetIndex) => {
        const { data } = await api.put(`/workspaces/${workspaceId}/boards/${boardId}/cards/reorder`, { cardId, targetListId, targetIndex });
        const board = get().currentBoard;
        if (board) set({ currentBoard: { ...board, lists: data } });
    },
}));
