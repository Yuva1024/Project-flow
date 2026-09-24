"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";

interface AccessToken {
    id: string;
    label: string;
    prefix: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
    createdAt: string;
}

function formatDate(value: string | null): string {
    if (!value) return "Never";
    return new Date(value).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

/**
 * Personal access tokens for the Blender add-on and Unreal plugin.
 *
 * Desktop tools cannot use the session JWT: it expires in seven days and
 * cannot be revoked. A token is long-lived, revocable per device, and means
 * neither tool ever handles the account password.
 *
 * The plaintext is returned exactly once, at creation — the server stores only
 * a hash — so this component holds it on screen until dismissed rather than
 * offering it again later.
 */
export default function AccessTokensSection() {
    const [tokens, setTokens] = useState<AccessToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [label, setLabel] = useState("");
    const [issued, setIssued] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get("/auth/tokens");
            setTokens(Array.isArray(data) ? data : []);
        } catch {
            toast.error("Could not load your access tokens");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const name = label.trim();
        if (!name) return;

        setCreating(true);
        try {
            const { data } = await api.post("/auth/tokens", { label: name });
            setIssued(data.token);
            setLabel("");
            await load();
        } catch (err: any) {
            toast.error(err?.response?.data?.message || "Could not create the token");
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (token: AccessToken) => {
        if (!confirm(`Revoke "${token.label}"? Any tool using it stops working immediately.`)) return;
        try {
            await api.delete(`/auth/tokens/${token.id}`);
            toast.success("Token revoked");
            await load();
        } catch {
            toast.error("Could not revoke the token");
        }
    };

    const copy = async (value: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success("Copied to clipboard");
        } catch {
            // Clipboard access needs a secure context and can be blocked; the
            // token is still on screen to select manually.
            toast.error("Copy failed — select the token and copy it manually");
        }
    };

    const labelStyle: React.CSSProperties = {
        fontSize: 11.5,
        fontWeight: 700,
        color: "var(--text-muted)",
        display: "block",
        marginBottom: 6,
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
                <h4 style={{ fontSize: 11, fontWeight: 800, margin: 0, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>
                    Access Tokens
                </h4>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.5 }}>
                    For the Blender add-on and Unreal plugin. They do not expire, and revoking
                    one here stops that machine immediately without touching your password.
                </p>
            </div>

            {/* The one and only time this value is available. */}
            {issued && (
                <div style={{ border: "1px solid var(--accent)", borderRadius: "var(--radius)", padding: 14, background: "rgba(99, 102, 241, 0.08)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
                        Copy this now — it will not be shown again
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                            readOnly
                            value={issued}
                            onFocus={(e) => e.currentTarget.select()}
                            style={{ flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 12 }}
                        />
                        <button type="button" onClick={() => copy(issued)} className="btn-primary"
                                style={{ padding: "8px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                            <Copy size={13} /> Copy
                        </button>
                    </div>
                    <button type="button" onClick={() => setIssued(null)} className="btn-ghost"
                            style={{ alignSelf: "flex-start", padding: "4px 8px", fontSize: 11.5 }}>
                        I have saved it
                    </button>
                </div>
            )}

            <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Device Name</label>
                    <input
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Blender on my laptop"
                        maxLength={100}
                    />
                </div>
                <button type="submit" className="btn-primary" disabled={creating || !label.trim()}
                        style={{ padding: "8px 14px", fontSize: 12, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                    {creating ? <Loader2 size={13} className="spinner" /> : <Plus size={13} />}
                    Create Token
                </button>
            </form>

            {loading ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
                    <Loader2 size={13} className="spinner" /> Loading…
                </div>
            ) : tokens.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
                    <KeyRound size={13} /> No tokens yet.
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {tokens.map((token) => (
                        <div key={token.id}
                             style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>{token.label}</div>
                                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                                    {token.prefix}…  ·  created {formatDate(token.createdAt)}  ·  last used {formatDate(token.lastUsedAt)}
                                </div>
                            </div>
                            <button type="button" onClick={() => handleRevoke(token)} className="btn-ghost"
                                    title="Revoke this token"
                                    style={{ color: "var(--danger)", padding: "6px 8px", display: "flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
                                <Trash2 size={13} /> Revoke
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
