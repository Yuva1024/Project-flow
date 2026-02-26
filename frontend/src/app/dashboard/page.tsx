"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useBoardStore } from "@/store/board";
import toast from "react-hot-toast";
import { LayoutDashboard, Plus, LogOut, Users, ChevronRight, Loader2, FolderKanban } from "lucide-react";
import WorkspaceMembersModal from "@/components/WorkspaceMembersModal";

export default function DashboardPage() {
    const router = useRouter();
    const { user, logout, loadUser, token, isLoading: authLoading } = useAuthStore();
    const { workspaces, boards, fetchWorkspaces, fetchBoards, createWorkspace, createBoard, setCurrentWorkspace, currentWorkspace, isLoading } = useBoardStore();
    const [showCreateWs, setShowCreateWs] = useState(false);
    const [showCreateBoard, setShowCreateBoard] = useState(false);
    const [showMembers, setShowMembers] = useState(false);
    const [wsName, setWsName] = useState("");
    const [boardTitle, setBoardTitle] = useState("");

    useEffect(() => { loadUser(); }, []);
    useEffect(() => {
        if (!authLoading && !token) { router.replace("/login"); return; }
        if (token) fetchWorkspaces().catch(() => { });
    }, [token, authLoading]);
    useEffect(() => {
        if (currentWorkspace) fetchBoards(currentWorkspace.id).catch(() => { });
    }, [currentWorkspace]);

    const handleCreateWs = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!wsName.trim()) return;
        try { await createWorkspace(wsName.trim()); setWsName(""); setShowCreateWs(false); toast.success("Workspace created"); }
        catch (err: any) { toast.error(err.response?.data?.message || "Failed"); }
    };
    const handleCreateBoard = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!boardTitle.trim() || !currentWorkspace) return;
        try { await createBoard(currentWorkspace.id, boardTitle.trim()); setBoardTitle(""); setShowCreateBoard(false); toast.success("Board created"); }
        catch (err: any) { toast.error(err.response?.data?.message || "Failed"); }
    };

    if (authLoading) return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
            <Loader2 size={24} className="spinner" style={{ color: "var(--accent)" }} />
        </div>
    );

    return (
        <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg-base)" }}>
            {/* Sidebar */}
            <aside style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", background: "var(--bg-surface)", borderRight: "1px solid var(--border-hover)" }}>
                {/* Brand */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(91,155,245,0.25)" }}>
                        <FolderKanban size={16} color="white" />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>ProjectFlow</span>
                </div>

                {/* Workspaces */}
                <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 8px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--text-muted)" }}>Workspaces</span>
                        <button onClick={() => setShowCreateWs(true)}
                            style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                            <Plus size={14} />
                        </button>
                    </div>

                    {showCreateWs && (
                        <form onSubmit={handleCreateWs} style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                            <input type="text" value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Workspace name" style={{ fontSize: 13, marginBottom: 8 }} autoFocus />
                            <div style={{ display: "flex", gap: 8 }}>
                                <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "6px 16px" }}>Create</button>
                                <button type="button" onClick={() => setShowCreateWs(false)} className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
                            </div>
                        </form>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {workspaces.map((ws) => {
                            const active = currentWorkspace?.id === ws.id;
                            return (
                                <button key={ws.id} onClick={() => setCurrentWorkspace(ws)}
                                    style={{
                                        width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 10,
                                        display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                                        background: active ? "var(--accent-soft)" : "transparent",
                                        borderTop: "none", borderRight: "none", borderBottom: "none",
                                        borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                                        color: "inherit", transition: "all 200ms",
                                    }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 12, fontWeight: 700, flexShrink: 0, color: "white",
                                        background: active ? "var(--accent)" : "var(--bg-card)",
                                    }}>
                                        {ws.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: active ? "var(--accent)" : "var(--text-primary)" }}>{ws.name}</div>
                                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{ws._count.members} members · {ws._count.boards} boards</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* User */}
                <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
                    {user && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 8, borderRadius: 10, background: "var(--bg-elevated)" }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, background: "var(--accent)", color: "white" }}>
                                {user.name?.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
                                <div style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                            </div>
                        </div>
                    )}
                    <button onClick={logout}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}>
                        <LogOut size={14} /> Sign out
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main style={{ flex: 1, overflowY: "auto" }}>
                {currentWorkspace ? (
                    <div>
                        {/* Header */}
                        <div style={{ padding: "40px 40px 32px" }}>
                            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32 }}>
                                <div>
                                    <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--accent)", marginBottom: 16 }} />
                                    <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 8 }}>{currentWorkspace.name}</h1>
                                    <p style={{ fontSize: 14, color: "var(--text-secondary)" }}>{currentWorkspace._count.boards} boards · {currentWorkspace._count.members} members</p>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <button onClick={() => setShowMembers(true)} className="btn-ghost"><Users size={14} /> Members</button>
                                    <button onClick={() => setShowCreateBoard(true)} className="btn-primary"><Plus size={14} /> New Board</button>
                                </div>
                            </div>
                        </div>

                        <div style={{ margin: "0 40px", borderTop: "1px solid var(--border)" }} />

                        {/* Create board */}
                        {showCreateBoard && (
                            <div style={{ padding: "24px 40px 0" }}>
                                <div style={{ maxWidth: 400, padding: 20, borderRadius: 12, background: "var(--bg-card)", border: "1px solid var(--border-hover)" }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Create a new board</h3>
                                    <form onSubmit={handleCreateBoard}>
                                        <input type="text" value={boardTitle} onChange={(e) => setBoardTitle(e.target.value)} placeholder="Board title" style={{ marginBottom: 12 }} autoFocus />
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="submit" className="btn-primary" style={{ fontSize: 12 }}>Create Board</button>
                                            <button type="button" onClick={() => setShowCreateBoard(false)} className="btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Board grid — using inline CSS grid */}
                        <div style={{ padding: "32px 40px" }}>
                            {boards.length > 0 ? (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
                                    {boards.map((board) => (
                                        <button key={board.id}
                                            onClick={() => router.push(`/board/${currentWorkspace.id}/${board.id}`)}
                                            style={{
                                                textAlign: "left", padding: 24, borderRadius: 12, cursor: "pointer",
                                                background: "var(--bg-card)", border: "1px solid var(--border-hover)",
                                                boxShadow: "var(--shadow-sm)", transition: "all 250ms",
                                                color: "inherit",
                                            }}
                                            onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--border-active)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--shadow)"; }}
                                            onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "var(--shadow-sm)"; }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                                                <div style={{ width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--accent-soft)" }}>
                                                    <LayoutDashboard size={18} style={{ color: "var(--accent)" }} />
                                                </div>
                                                <ChevronRight size={16} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
                                            </div>
                                            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{board.title}</h3>
                                            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{board.visibility?.toLowerCase()} · {board._count?.lists ?? 0} lists</p>
                                        </button>
                                    ))}
                                </div>
                            ) : !isLoading ? (
                                <div style={{ textAlign: "center", padding: "96px 0", color: "var(--text-muted)" }}>
                                    <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-card)" }}>
                                        <LayoutDashboard size={24} />
                                    </div>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>No boards yet</p>
                                    <p style={{ fontSize: 12 }}>Create your first board to get started</p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
                        <div style={{ textAlign: "center" }}>
                            <div style={{ width: 56, height: 56, borderRadius: 16, margin: "0 auto 16px", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-card)" }}>
                                <Users size={24} />
                            </div>
                            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Select a workspace</p>
                            <p style={{ fontSize: 12 }}>Choose from the sidebar or create a new one</p>
                        </div>
                    </div>
                )}
            </main>

            {showMembers && currentWorkspace && (
                <WorkspaceMembersModal workspaceId={currentWorkspace.id} workspaceName={currentWorkspace.name} onClose={() => setShowMembers(false)} />
            )}
        </div>
    );
}
