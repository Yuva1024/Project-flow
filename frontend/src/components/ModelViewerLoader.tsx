"use client";

import { useEffect } from "react";

/**
 * Registers the <model-viewer> custom element once, from the local npm package.
 *
 * This used to be a <script src="https://ajax.googleapis.com/..."> in the root
 * layout with no integrity hash, which put an unpinned third-party bundle on
 * every page — including /login, where it would have had access to the token in
 * localStorage. `@google/model-viewer` is already a dependency, so importing it
 * here drops the external origin entirely and pins the version via the lockfile.
 *
 * The import is dynamic because the package touches `window` at module scope and
 * cannot be evaluated during server rendering.
 */
export default function ModelViewerLoader() {
    useEffect(() => {
        let cancelled = false;
        import("@google/model-viewer").catch((err) => {
            if (!cancelled) console.error("Failed to load model-viewer:", err);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    return null;
}
