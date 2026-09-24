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

/** Shared by concurrent callers: several pages call loadUser on mount. */
let loadUserInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
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
        if (!token) {
            set({ user: null, token: null, isLoading: false });
            return;
        }

        // Every page calls this on mount, so moving between the dashboard and a
        // board used to re-fetch the same user each time. The store is global
        // and survives client-side navigation, so reuse what is already loaded.
        const current = get();
        if (current.user && current.token === token) {
            if (current.isLoading) set({ isLoading: false });
            return;
        }

        if (loadUserInFlight) return loadUserInFlight;

        loadUserInFlight = (async () => {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    const { data } = await api.get('/auth/me');
                    set({ user: data.user, token, isLoading: false });
                    return;
                } catch (err: any) {
                    const status = err?.response?.status;
                    if (status === 401 || status === 404) {
                        // Genuinely signed out: the token is invalid or the user
                        // no longer exists. The interceptor has already redirected.
                        localStorage.removeItem('token');
                        set({ user: null, token: null, isLoading: false });
                        return;
                    }
                    // Anything else — a network error, or a 5xx while the
                    // free-tier backend is still waking — says nothing about the
                    // session. This used to clear the token on every failure, so a
                    // sleeping server logged people out. Retry once, then keep the
                    // session and let the next request try again.
                    if (attempt === 0) {
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        continue;
                    }
                    console.error('loadUser failed, keeping session:', err);
                    set({ isLoading: false });
                }
            }
        })().finally(() => {
            loadUserInFlight = null;
        });

        return loadUserInFlight;
    },

    updateProfile: async (name, avatarUrl) => {
        const { data } = await api.patch('/auth/profile', { name, avatarUrl });
        set({ user: data.user });
    },

    changePassword: async (oldPassword, newPassword) => {
        await api.patch('/auth/password', { oldPassword, newPassword });
    },
}));
