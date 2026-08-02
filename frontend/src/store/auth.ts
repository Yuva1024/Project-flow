import { create } from 'zustand';
import api from '@/lib/api';

interface User {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
    isAdmin?: boolean;
}

interface AuthState {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (name: string, email: string, password: string) => Promise<void>;
    recoverAccount: (email: string, recoveryCode: string, newPassword: string) => Promise<void>;
    logout: () => void;
    loadUser: () => Promise<void>;
    updateProfile: (name?: string, avatarUrl?: string | null) => Promise<void>;
    changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
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

    recoverAccount: async (email, recoveryCode, newPassword) => {
        const { data } = await api.post('/auth/recover-account', { email, recoveryCode, newPassword });
        localStorage.setItem('token', data.token);
        set({ user: data.user, token: data.token });
    },

    logout: () => {
        localStorage.removeItem('token');
        set({ user: null, token: null });
        window.location.href = '/login';
    },

    loadUser: async () => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const { data } = await api.get('/auth/me');
                if (data && data.unauthorized) {
                    localStorage.removeItem('token');
                    set({ user: null, token: null, isLoading: false });
                } else {
                    set({ user: data.user, token, isLoading: false });
                }
            } catch (err) {
                console.error('loadUser error:', err);
                localStorage.removeItem('token');
                set({ user: null, token: null, isLoading: false });
            }
        } else {
            set({ isLoading: false });
        }
    },

    updateProfile: async (name, avatarUrl) => {
        const { data } = await api.patch('/auth/profile', { name, avatarUrl });
        set({ user: data.user });
    },

    changePassword: async (oldPassword, newPassword) => {
        await api.patch('/auth/password', { oldPassword, newPassword });
    },
}));
