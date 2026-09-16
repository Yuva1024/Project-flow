import rateLimit from 'express-rate-limit';

const standardOptions = {
    standardHeaders: true,   // RateLimit-* headers
    legacyHeaders: false,    // Disable X-RateLimit-* headers
} as const;

/** General API limiter — applies to every /api route. */
export const apiLimiter = rateLimit({
    ...standardOptions,
    windowMs: 60 * 1000,
    limit: 300,
    message: { message: 'Too many requests, please try again later.' },
});

/**
 * Strict limiter for credential endpoints (login/register/recovery).
 * Successful requests don't count, so normal users aren't punished.
 */
export const authLimiter = rateLimit({
    ...standardOptions,
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    message: { message: 'Too many attempts, please try again in 15 minutes.' },
});

/** Limiter for file uploads — they are expensive (memory + storage IO). */
export const uploadLimiter = rateLimit({
    ...standardOptions,
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: { message: 'Upload limit reached, please try again later.' },
});
