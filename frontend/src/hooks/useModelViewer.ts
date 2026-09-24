"use client";

import { useEffect } from "react";

/**
 * Loads the <model-viewer> custom element on demand.
 *
 * `@google/model-viewer` bundles Three.js and Lit — roughly 1 MB of JavaScript
 * before compression. It used to be imported from the root layout, which made
 * every page pay for it, including login and register where nothing is 3D.
 * Parsing that much code blocks the main thread, which showed up as buttons
 * that felt slow to respond.
 *
 * Now each component that actually renders a <model-viewer> calls this with
 * whether it has anything 3D to show, and the library is fetched only then.
 */

let loading: Promise<unknown> | null = null;

export function ensureModelViewer(): void {
    if (typeof window === "undefined" || loading) return;
    loading = import("@google/model-viewer").catch((err) => {
        // Allow a later call to retry rather than caching the failure forever.
        loading = null;
        console.error("Failed to load model-viewer:", err);
    });
}

export function useModelViewer(enabled: boolean = true): void {
    useEffect(() => {
        if (enabled) ensureModelViewer();
    }, [enabled]);
}
