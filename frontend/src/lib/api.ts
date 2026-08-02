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
            return Promise.resolve({ data: { unauthorized: true } });
        }
        return Promise.reject(error);
    }
);

export default api;
