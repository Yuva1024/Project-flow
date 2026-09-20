import axios from 'axios';

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

api.interceptors.response.use(
    (res) => res,
    (error) => {
        const isUnauthorized = error.response?.status === 401;
        const isMe404 = error.config?.url?.includes('/auth/me') && error.response?.status === 404;

        if (isUnauthorized || isMe404) {
            if (typeof window !== 'undefined') {
                localStorage.removeItem('token');
                if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
                    window.location.href = '/login';
                }
            }
        }

        // Always reject. Resolving with a sentinel object here used to hand every
        // caller `{ unauthorized: true }` as if the request had succeeded — so
        // `const { data } = await api.get(...)` would assign that object where a
        // list was expected and the next `.map()` threw, instead of the caller's
        // catch block running.
        return Promise.reject(error);
    }
);

export default api;
