"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { Tldraw, TLStore, createTLStore, defaultShapeUtils, getSnapshot, loadSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { ArrowLeft, Loader2 } from "lucide-react";
import toast from "react-hot-toast";

export default function WhiteboardPage() {
    const params = useParams();
    const router = useRouter();
    const workspaceId = params.workspaceId as string;
    const wbId = params.wbId as string;

    const [store] = useState<TLStore>(() => createTLStore({ shapeUtils: defaultShapeUtils }));
    const [isLoading, setIsLoading] = useState(true);
    const [name, setName] = useState("");
    const isReadyRef = useRef(false);

    // Custom debounce for saving
    const saveTimer = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const fetchWhiteboard = async () => {
            try {
                const { data } = await api.get(`/workspaces/${workspaceId}/whiteboards/${wbId}`);
                setName(data.name);

                if (data.elements && data.elements !== "[]") {
                    try {
                        const parsed = typeof data.elements === "string" ? JSON.parse(data.elements) : data.elements;
                        if (parsed && Object.keys(parsed).length > 0) {
                            loadSnapshot(store, parsed);
                        }
                    } catch (e) {
                        console.error("Failed to parse whiteboard elements", e);
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
        const cleanup = store.listen(() => {
            if (!isReadyRef.current) return;
            
            if (saveTimer.current) clearTimeout(saveTimer.current);
            
            saveTimer.current = setTimeout(async () => {
                const snapshot = getSnapshot(store);
                try {
                    await api.patch(`/workspaces/${workspaceId}/whiteboards/${wbId}`, {
                        elements: snapshot
                    });
                } catch (e) {
                    console.error("Failed to save whiteboard", e);
                }
            }, 1000);
        });

        return () => {
            cleanup();
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, [store, workspaceId, wbId]);

    const handleAssetUpload = useCallback(async (file: File) => {
        try {
            const formData = new FormData();
            formData.append("file", file);
            const { data } = await api.post(`/workspaces/${workspaceId}/whiteboards/${wbId}/assets`, formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            return data.url as string;
        } catch (error) {
            console.error("Asset upload error:", error);
            toast.error("Failed to upload image");
            return false;
        }
    }, [workspaceId, wbId]);

    if (isLoading) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-root)" }}>
                <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)" }} />
            </div>
        );
    }

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
                <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                    Auto-saving enabled
                </div>
            </div>

            {/* Canvas */}
            <div style={{ flex: 1, position: "relative" }}>
                <Tldraw store={store} inferDarkMode onAssetUpload={handleAssetUpload} />
            </div>
        </div>
    );
}
