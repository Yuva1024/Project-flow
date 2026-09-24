"use client";

import { useEffect } from "react";

/**
 * Wakes the backend as early as possible.
 *
 * The API runs on Render's free tier, which stops the service after about
 * fifteen minutes without traffic. Measured against production, the first
 * request after that takes around 22 seconds; every request after it takes
 * under 100 ms. So the cost is paid once per quiet period, by whoever arrives
 * first — and it lands on their first real action, usually signing in.
 *
 * Firing a cheap ping the moment any page opens moves that wait off the
 * critical path: the server wakes while the person is still reading the page or
 * typing a password. /api/health is registered ahead of the rate limiter and
 * touches no database, so it is safe to call freely.
 *
 * Also re-pings when a tab comes back into focus after a long absence, since
 * the server has probably gone back to sleep in the meantime.
 */

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

/** Render sleeps after ~15 minutes idle; re-warm a little before that. */
const REWARM_AFTER_MS = 10 * 60 * 1000;

let lastPing = 0;

function ping() {
    const now = Date.now();
    if (now - lastPing < REWARM_AFTER_MS) return;
    lastPing = now;

    // keepalive lets the request finish even if the page navigates away.
    // Failures are irrelevant here: this only exists to trigger a wake-up.
    fetch(`${API}/health`, { method: "GET", keepalive: true, cache: "no-store" }).catch(() => {
        lastPing = 0;
    });
}

export default function ServerWarmup() {
    useEffect(() => {
        ping();

        const onVisible = () => {
            if (document.visibilityState === "visible") ping();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, []);

    return null;
}
