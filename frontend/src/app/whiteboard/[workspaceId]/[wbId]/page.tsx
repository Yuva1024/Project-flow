"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { Tldraw, TLAssetStore, TLStore, createTLStore, defaultShapeUtils, getSnapshot, loadSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { ArrowLeft, Loader2, Check, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";

type SaveState = "saved" | "pending" | "saving" | "error";

/** Quiet period after the last edit before saving. */
const SAVE_DELAY_MS = 800;

export default function WhiteboardPage() {
    const params = useParams();
    const router = useRouter();
    const workspaceId = params.workspaceId as string;
    const wbId = params.wbId as string;

    // Images go to storage and the snapshot keeps only their URL. Without an
    // asset store, tldraw inlines every image as base64 inside the snapshot,
    // which bloats each autosave and quickly exceeds the request size limit.
    // This upload handler existed before but was never passed to tldraw.
    const [store] = useState<TLStore>(() => {
        const assets: TLAssetStore = {
            async upload(_asset, file) {
                const formData = new FormData();
                formData.append("file", file);
                try {
                    const { data } = await api.post(
                        `/workspaces/${workspaceId}/whiteboards/${wbId}/assets`,
                        formData,
                        { headers: { "Content-Type": "multipart/form-data" } },
                    );
                    return { src: data.url as string };
                } catch (error) {
                    toast.error("Failed to upload image");
                    throw error;
                }
            },
            resolve(asset) {
                return asset.props.src;
            },
        };
        return createTLStore({ shapeUtils: defaultShapeUtils, assets });
    });

    const [isLoading, setIsLoading] = useState(true);
    const [name, setName] = useState("");
    const [saveState, setSaveState] = useState<SaveState>("saved");

    const isReadyRef = useRef(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dirtyRef = useRef(false);
    const savingRef = useRef(false);
    const errorShownRef = useRef(false);

    const save = useCallback(async () => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }
        if (!dirtyRef.current) return;

        dirtyRef.current = false;
        savingRef.current = true;
        setSaveState("saving");

        try {
            await api.patch(`/workspaces/${workspaceId}/whiteboards/${wbId}`, {
                elements: getSnapshot(store),
            });
            savingRef.current = false;
            errorShownRef.current = false;
            // Another edit may have landed while this was in flight.
            setSaveState(dirtyRef.current ? "pending" : "saved");
        } catch (e) {
            savingRef.current = false;
            dirtyRef.current = true; // keep it so the next edit retries
            setSaveState("error");
            // Failing silently is how every whiteboard used to lose its content
            // without anyone noticing. Say so — once, not on every keystroke.
            if (!errorShownRef.current) {
                errorShownRef.current = true;
                toast.error("Could not save the whiteboard. Your changes are not saved yet.");
            }
            console.error("Failed to save whiteboard", e);
        }
    }, [store, workspaceId, wbId]);

    useEffect(() => {
        const fetchWhiteboard = async () => {
            try {
                const { data } = await api.get(`/workspaces/${workspaceId}/whiteboards/${wbId}`);
                setName(data.name);

                const raw = typeof data.elements === "string" ? JSON.parse(data.elements) : data.elements;
                // A saved board is a tldraw snapshot object. Rows created before
                // saving worked still hold the original [] default.
                if (raw && !Array.isArray(raw) && raw.document) {
                    try {
                        loadSnapshot(store, raw);
                    } catch (e) {
                        console.error("Failed to load whiteboard snapshot", e);
                        toast.error("This whiteboard could not be fully loaded");
                    }
                }

                setIsLoading(false);
                isReadyRef.current = true;
            } catch (err: any) {
                toast.error(err.response?.data?.message || "Failed to load whiteboard");
                router.push("/dashboard");
            }
        };
        fetchWhiteboard();
    }, [workspaceId, wbId, router, store]);

    useEffect(() => {
        // Only document changes are worth saving; camera moves and selection
        // live in the session and would otherwise trigger a save on every pan.
        const stopListening = store.listen(
            () => {
                if (!isReadyRef.current) return;
                dirtyRef.current = true;
                setSaveState("pending");
                if (saveTimer.current) clearTimeout(saveTimer.current);
                saveTimer.current = setTimeout(save, SAVE_DELAY_MS);
            },
            { scope: "document", source: "user" },
        );

        return () => {
            stopListening();
            // Leaving the page used to cancel the pending save outright, so
            // anything drawn in the last second before clicking Back was lost.
            // Flush it instead; the request outlives this component.
            if (dirtyRef.current) save();
            else if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, [store, save]);

    useEffect(() => {
        // Closing or reloading the tab cannot wait for a request, so ask the
        // browser to confirm instead of silently dropping unsaved work.
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!dirtyRef.current && !savingRef.current) return;
            e.preventDefault();
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, []);

    if (isLoading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-root)" }}>
                <Loader2 size={32} className="spinner" style={{ color: "var(--accent)" }} />
            </div>
        );
    }

    const status = {
        saved: { text: "Saved", color: "var(--text-muted)", icon: <Check size={12} /> },
        pending: { text: "Unsaved changes", color: "var(--text-muted)", icon: null },
        saving: { text: "Saving…", color: "var(--text-muted)", icon: <Loader2 size={12} className="spinner" /> },
        error: { text: "Not saved — retrying on next edit", color: "var(--danger)", icon: <AlertCircle size={12} /> },
    }[saveState];

    return (
        <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{
                height: 50, background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
                display: "flex", alignItems: "center", padding: "0 16px", gap: 16, zIndex: 10
            }}>
                <button
                    onClick={() => router.push("/dashboard")}
                    className="btn-ghost"
                    style={{ padding: 6, display: "flex", borderRadius: 8 }}
                    aria-label="Back to dashboard"
                >
                    <ArrowLeft size={18} />
                </button>
                <div style={{
                    width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.2)"
                }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                </div>
                <h1 style={{ fontSize: 14, fontWeight: 750, letterSpacing: "-0.01em" }}>{name}</h1>
                {/* Reports what actually happened, rather than a fixed label that
                    claimed auto-saving worked while every save was failing. */}
                <div role="status" aria-live="polite"
                     style={{ marginLeft: "auto", fontSize: 11, color: status.color, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {status.icon}
                    {status.text}
                </div>
            </div>

            {/* Canvas */}
            <div style={{ flex: 1, position: "relative" }}>
                <Tldraw store={store} />
            </div>
        </div>
    );
}
