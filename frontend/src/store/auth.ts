import { create } from 'zustand';
import api from '@/lib/api';

interface User {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (name: string, email: string, password: string) => Promise<void>;
    logout: () => void;
    loadUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
    isLoading: true,

    login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        localStorage.setItem('token', data.token);
        set({ user: data.user, token: data.token });
    },

    register: async (name, email, password) => {
        const { data } = await api.post('/auth/register', { name, email, password });
        localStorage.setItem('token', data.token);
        set({ user: data.user, token: data.token });
    },

    logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null });
        window.location.href = '/login';
    },

    loadUser: () => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                set({ user: { id: payload.userId, name: '', email: '' }, token, isLoading: false });
            } catch {
                set({ isLoading: false });
            }
        } else {
            set({ isLoading: false });
        }
    },
}));
