"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useBoardStore } from "@/store/board";
import toast from "react-hot-toast";
import { LayoutDashboard, Plus, LogOut, Users, ChevronRight, Loader2, FolderKanban, X, Sun, Moon, Shield } from "lucide-react";
import WorkspaceMembersModal from "@/components/WorkspaceMembersModal";
import NotificationDropdown from "@/components/NotificationDropdown";
import { useTheme } from "@/hooks/useTheme";

export default function DashboardPage() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const { user, logout, loadUser, token, isLoading: authLoading, updateProfile, changePassword } = useAuthStore();
    const {
        workspaces, boards, fetchWorkspaces, fetchBoards, createWorkspace, createBoard, setCurrentWorkspace, currentWorkspace, isLoading,
        updateWorkspace, deleteWorkspace, updateBoard, deleteBoard
    } = useBoardStore();

    const [showCreateWs, setShowCreateWs] = useState(false);
    const [showCreateBoard, setShowCreateBoard] = useState(false);
    const [showMembers, setShowMembers] = useState(false);
    const [wsName, setWsName] = useState("");
    const [boardTitle, setBoardTitle] = useState("");

    // Workspace edit/delete state
    const [editingWsId, setEditingWsId] = useState<string | null>(null);
    const [editWsName, setEditWsName] = useState("");
    const [showDeleteWsModal, setShowDeleteWsModal] = useState(false);

    // Board edit/delete state
    const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
    const [editBoardTitle, setEditBoardTitle] = useState("");
    const [showDeleteBoardModal, setShowDeleteBoardModal] = useState<string | null>(null);

    // Profile settings modal state
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [profileName, setProfileName] = useState("");
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");

    useEffect(() => { loadUser(); }, []);
    useEffect(() => {
        if (!authLoading && !token) { router.replace("/login"); return; }
        if (token) fetchWorkspaces().catch(() => { });
    }, [token, authLoading]);
    useEffect(() => {
        if (currentWorkspace) fetchBoards(currentWorkspace.id).catch(() => { });
    }, [currentWorkspace]);
    useEffect(() => {
        if (user) {
            setProfileName(user.name);
        }
    }, [user]);

    const handleCreateWs = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!wsName.trim()) return;
        try { await createWorkspace(wsName.trim()); setWsName(""); setShowCreateWs(false); toast.success("Workspace created"); }
        catch (err: any) { toast.error(err.response?.data?.message || "Failed"); }
    };

    const handleRenameWorkspace = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editWsName.trim() || !currentWorkspace) return;
        try {
            await updateWorkspace(currentWorkspace.id, editWsName.trim());
            setEditingWsId(null);
            toast.success("Workspace renamed");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to rename workspace");
        }
    };

    const handleDeleteWorkspace = async () => {
        if (!currentWorkspace) return;
        try {
            await deleteWorkspace(currentWorkspace.id);
            setShowDeleteWsModal(false);
            toast.success("Workspace deleted");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete workspace");
        }
    };

    const handleCreateBoard = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!boardTitle.trim() || !currentWorkspace) return;
        try { await createBoard(currentWorkspace.id, boardTitle.trim()); setBoardTitle(""); setShowCreateBoard(false); toast.success("Board created"); }
        catch (err: any) { toast.error(err.response?.data?.message || "Failed"); }
    };

    const handleRenameBoard = async (e: React.FormEvent, boardId: string) => {
        e.preventDefault();
        if (!editBoardTitle.trim() || !currentWorkspace) return;
        try {
            await updateBoard(currentWorkspace.id, boardId, { title: editBoardTitle.trim() });
            setEditingBoardId(null);
            toast.success("Board renamed");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to rename board");
        }
    };

    const handleDeleteBoard = async (boardId: string) => {
        if (!currentWorkspace) return;
        try {
            await deleteBoard(currentWorkspace.id, boardId);
            setShowDeleteBoardModal(null);
            toast.success("Board deleted");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete board");
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await updateProfile(profileName);
            toast.success("Profile updated");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to update profile");
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await changePassword(oldPassword, newPassword);
            setOldPassword("");
            setNewPassword("");
            toast.success("Password changed successfully");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to change password");
        }
    };

    if (authLoading) return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg-base)" }}>
            <Loader2 size={28} className="spinner" style={{ color: "var(--accent)" }} />
        </div>
    );

    return (
        <div style={{ minHeight: "100vh", display: "flex", background: "transparent", color: "var(--text-primary)" }}>
            {/* Sidebar */}
            <aside style={{
                width: 270, flexShrink: 0, display: "flex", flexDirection: "column",
                background: "var(--bg-surface)", borderRight: "1px solid var(--border)",
                backdropFilter: "blur(24px) saturate(140%)"
            }}>
                {/* Brand */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "24px 28px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: 9,
                        background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-secondary) 100%)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)"
                    }}>
                        <FolderKanban size={15} color="white" />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.02em" }}>ProjectFlow</span>
                </div>

                {/* Workspaces Section */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 8px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--text-muted)" }}>Workspaces</span>
                        <button onClick={() => setShowCreateWs(true)}
                                style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", transition: "color 150ms" }}
                                onMouseOver={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                                onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}>
                            <Plus size={14} />
                        </button>
                    </div>

                    {showCreateWs && (
                        <form onSubmit={handleCreateWs} style={{ marginBottom: 16, padding: 14, borderRadius: "var(--radius)", background: "var(--bg-elevated)", border: "1px solid var(--border-hover)", boxShadow: "var(--shadow)" }}>
                            <input type="text" value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Workspace name" style={{ fontSize: 13, marginBottom: 10 }} autoFocus />
                            <div style={{ display: "flex", gap: 8 }}>
                                <button type="submit" className="btn-primary" style={{ fontSize: 11.5, padding: "6px 14px", flex: 1 }}>Create</button>
                                <button type="button" onClick={() => setShowCreateWs(false)} className="btn-ghost" style={{ fontSize: 11.5, padding: "6px 10px" }}>Cancel</button>
                            </div>
                        </form>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {workspaces.map((ws) => {
                            const active = currentWorkspace?.id === ws.id;
                            return (
                                <button key={ws.id} onClick={() => setCurrentWorkspace(ws)}
                                    style={{
                                        width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius)",
                                        display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                                        background: active ? "var(--bg-active)" : "transparent",
                                        border: "1px solid " + (active ? "var(--border-hover)" : "transparent"),
                                        color: "inherit", transition: "all 200ms var(--ease)",
                                    }}
                                    onMouseOver={(e) => { if (!active) e.currentTarget.style.background = "var(--bg-hover)"; }}
                                    onMouseOut={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: 11, fontWeight: 800, flexShrink: 0, color: "white",
                                        background: active ? "linear-gradient(135deg, var(--accent) 0%, var(--accent-secondary) 100%)" : "var(--bg-hover)",
                                        boxShadow: active ? "0 2px 6px rgba(168, 85, 247, 0.2)" : "none",
                                    }}>
                                        {ws.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: active ? 700 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: active ? "var(--text-primary)" : "var(--text-secondary)" }}>{ws.name}</div>
                                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{ws._count.boards} boards · {ws._count.members} members</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Sidebar Bottom User Profile */}
                <div style={{ padding: 16, borderTop: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                    {user && (
                        <div style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                            borderRadius: "var(--radius)", background: "var(--bg-card)", border: "1px solid var(--border)",
                            backdropFilter: "blur(10px)", marginBottom: 10, position: "relative"
                        }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center",
                                justifyContent: "center", fontSize: 12, fontWeight: 700, 
                                background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-secondary) 100%)", color: "white", flexShrink: 0
                            }}>
                                {user.name?.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div>
                                <div style={{ fontSize: 10.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                            </div>
                            <button onClick={() => setShowProfileModal(true)}
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", borderRadius: 6, transition: "color 150ms" }}
                                    onMouseOver={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                                    onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                                    title="Profile settings">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                                </svg>
                            </button>
                        </div>
                    )}
                    <button onClick={logout}
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--radius)", fontSize: 12, fontWeight: 700, background: "none", border: "none", cursor: "pointer", color: "var(--danger)", transition: "background 180ms" }}
                        onMouseOver={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)"}
        onMouseOut={(e) => e.currentTarget.style.background = "none"}>
                        <LogOut size={13} /> Sign out
                    </button>
                </div>
            </aside>

            {/* Main Area */}
            <main style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", background: "transparent" }}>
                {/* Header */}
                <div style={{ padding: "40px 48px 24px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
                        <div>
                            {currentWorkspace ? (
                                editingWsId === currentWorkspace.id ? (
                                    <form onSubmit={handleRenameWorkspace} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <input
                                            type="text"
                                            value={editWsName}
                                            onChange={(e) => setEditWsName(e.target.value)}
                                            style={{ fontSize: 24, fontWeight: 800, padding: "6px 12px", width: "280px", borderRadius: "var(--radius)", border: "1px solid var(--border-active)", background: "var(--bg-card)" }}
                                            autoFocus
                                        />
                                        <button type="submit" className="btn-primary" style={{ padding: "8px 16px" }}>Save</button>
                                        <button type="button" onClick={() => setEditingWsId(null)} className="btn-ghost" style={{ padding: "8px 16px" }}>Cancel</button>
                                    </form>
                                ) : (
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <h1 style={{ fontSize: 25, fontWeight: 850, letterSpacing: "-0.03em", margin: 0 }}>{currentWorkspace.name}</h1>
                                        {currentWorkspace.ownerId === user?.id && (
                                            <button
                                                onClick={() => {
                                                    setEditingWsId(currentWorkspace.id);
                                                    setEditWsName(currentWorkspace.name);
                                                }}
                                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", borderRadius: 6, transition: "color 150ms" }}
                                                onMouseOver={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                                                onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                                                title="Rename workspace"
                                            >
                                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                            </button>
                                        )}
                                    </div>
                                )
                            ) : (
                                <h1 style={{ fontSize: 25, fontWeight: 850, letterSpacing: "-0.03em", margin: 0 }}>Overview</h1>
                            )}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <button onClick={toggleTheme} className="btn-ghost" style={{ padding: 8, display: "flex", alignItems: "center", justifyContent: "center" }} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                            </button>
                            {user?.isAdmin && (
                                <button onClick={() => router.push("/admin")} className="btn-ghost"
                                    style={{
                                        padding: "7px 14px", fontSize: 12, fontWeight: 700,
                                        display: "flex", alignItems: "center", gap: 6,
                                        background: "rgba(239, 68, 68, 0.08)",
                                        border: "1px solid rgba(239, 68, 68, 0.2)",
                                        color: "#ef4444"
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.15)"}
                                    onMouseOut={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)"}
                                    title="Admin Panel">
                                    <Shield size={13} /> Admin
                                </button>
                            )}
                            <NotificationDropdown />
                            {currentWorkspace && (
                                <>
                                    <button onClick={() => setShowMembers(true)} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12.5 }}><Users size={14} /> Members</button>
                                    {currentWorkspace.ownerId === user?.id && (
                                        <button onClick={() => setShowDeleteWsModal(true)} className="btn-ghost" style={{ color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.15)", padding: "8px 14px", fontSize: 12.5 }}
                                                onMouseOver={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.06)"}
                                                onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
                                            Delete Workspace
                                        </button>
                                    )}
                                    <button onClick={() => setShowCreateBoard(true)} className="btn-primary" style={{ padding: "8px 16px", fontSize: 12.5 }}><Plus size={14} /> New Board</button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Workspace Metrics / Info */}
                    {currentWorkspace && (
                        <div style={{ display: "flex", gap: 16, marginTop: 24 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "6px 12px", fontSize: 12, color: "var(--text-secondary)" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }} />
                                <span style={{ fontWeight: 800, color: "var(--text-primary)" }}>{currentWorkspace._count.boards}</span> boards
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "6px 12px", fontSize: 12, color: "var(--text-secondary)" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-secondary)", boxShadow: "0 0 6px var(--accent-secondary)" }} />
                                <span style={{ fontWeight: 800, color: "var(--text-primary)" }}>{currentWorkspace._count.members}</span> members
                            </div>
                        </div>
                    )}
                </div>

                {currentWorkspace ? (
                    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>

                        {/* Create Board Inline Panel */}
                        {showCreateBoard && (
                            <div style={{ padding: "24px 48px 0" }}>
                                <div className="glass-panel" style={{ maxWidth: 440, padding: 24, borderRadius: "var(--radius-lg)", border: "1px solid var(--border-hover)", boxShadow: "var(--shadow)" }}>
                                    <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 16 }}>Create a new board</h3>
                                    <form onSubmit={handleCreateBoard}>
                                        <input type="text" value={boardTitle} onChange={(e) => setBoardTitle(e.target.value)} placeholder="Board title" style={{ marginBottom: 16 }} autoFocus />
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="submit" className="btn-primary" style={{ fontSize: 12, flex: 1 }}>Create Board</button>
                                            <button type="button" onClick={() => setShowCreateBoard(false)} className="btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        )}

                        {/* Board Grid */}
                        <div style={{ padding: "36px 48px", flex: 1 }}>
                            {boards.length > 0 ? (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
                                    {boards.map((board) => (
                                        <div key={board.id}
                                            className="glass-panel-interactive"
                                            style={{
                                                position: "relative", display: "flex", flexDirection: "column", borderRadius: "var(--radius-lg)",
                                                border: "1px solid var(--border)", background: "var(--bg-card)",
                                            }}
                                        >
                                            {editingBoardId === board.id ? (
                                                <form onSubmit={(e) => handleRenameBoard(e, board.id)} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                                                    <input
                                                        type="text"
                                                        value={editBoardTitle}
                                                        onChange={(e) => setEditBoardTitle(e.target.value)}
                                                        style={{ fontSize: 13.5, fontWeight: 700, padding: 8, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-active)", background: "var(--bg-surface)" }}
                                                        autoFocus
                                                    />
                                                    <div style={{ display: "flex", gap: 8 }}>
                                                        <button type="submit" className="btn-primary" style={{ fontSize: 11, padding: "5px 12px" }}>Save</button>
                                                        <button type="button" onClick={() => setEditingBoardId(null)} className="btn-ghost" style={{ fontSize: 11, padding: "5px 10px" }}>Cancel</button>
                                                    </div>
                                                </form>
                                            ) : (
                                                <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 140 }}>
                                                    <div style={{ padding: 24, cursor: "pointer", flex: 1, display: "flex", flexDirection: "column" }} onClick={() => router.push(`/board/${currentWorkspace.id}/${board.id}`)}>
                                                        {/* Top icon and actions */}
                                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                                                            <div style={{
                                                                width: 36, height: 36, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                                                                background: "var(--accent-soft)", border: "1px solid var(--border)"
                                                            }}>
                                                                <LayoutDashboard size={16} style={{ color: "var(--accent)" }} />
                                                            </div>
                                                            <div style={{ display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingBoardId(board.id);
                                                                        setEditBoardTitle(board.title);
                                                                    }}
                                                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", borderRadius: 6, transition: "color 150ms" }}
                                                                    onMouseOver={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                                                                    onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                                                                    title="Rename board"
                                                                >
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                                </button>
                                                                <button
                                                                    onClick={() => setShowDeleteBoardModal(board.id)}
                                                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", borderRadius: 6, transition: "color 150ms" }}
                                                                    onMouseOver={(e) => e.currentTarget.style.color = "var(--danger)"}
                                                                    onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                                                                    title="Delete board"
                                                                >
                                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Title */}
                                                        <h3 style={{ fontSize: 14.5, fontWeight: 750, color: "var(--text-primary)", marginBottom: 6 }}>{board.title}</h3>
                                                        
                                                        {/* Status items */}
                                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: "auto" }}>
                                                            <span style={{
                                                                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5,
                                                                textTransform: "uppercase", background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)"
                                                            }}>
                                                                {board.visibility?.toLowerCase()}
                                                            </span>
                                                            <span style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 500 }}>
                                                                {board._count?.lists ?? 0} lists
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Create Board Quick Placeholder */}
                                    <div
                                        onClick={() => setShowCreateBoard(true)}
                                        style={{
                                            minHeight: 140, borderRadius: "var(--radius-lg)", border: "1.5px dashed var(--border-active)",
                                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                            cursor: "pointer", transition: "all 200ms var(--ease)", background: "transparent", gap: 10
                                        }}
                                        onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "var(--accent-glow)"; }}
                                        onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border-active)"; e.currentTarget.style.background = "transparent"; }}
                                    >
                                        <div style={{
                                            width: 32, height: 32, borderRadius: "50%", border: "1.5px solid var(--border-active)",
                                            display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)"
                                        }}>
                                            <Plus size={16} />
                                        </div>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>New Board</span>
                                    </div>
                                </div>
                            ) : !isLoading ? (
                                <div style={{ textAlign: "center", padding: "120px 0", color: "var(--text-muted)" }}>
                                    <div style={{
                                        width: 52, height: 52, borderRadius: 14, margin: "0 auto 20px", display: "flex",
                                        alignItems: "center", justifyContent: "center", background: "var(--bg-card)", border: "1px solid var(--border)"
                                    }}>
                                        <LayoutDashboard size={22} style={{ color: "var(--text-muted)" }} />
                                    </div>
                                    <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>No boards yet</p>
                                    <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20 }}>Create your first board in this workspace to get started</p>
                                    <button onClick={() => setShowCreateBoard(true)} className="btn-primary" style={{ padding: "8px 16px", fontSize: 12 }}><Plus size={13} /> Create Board</button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "var(--text-muted)" }}>
                        <div style={{ textAlign: "center" }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: 16, margin: "0 auto 20px", display: "flex",
                                alignItems: "center", justifyContent: "center", background: "var(--bg-card)", border: "1px solid var(--border)"
                            }}>
                                <Users size={22} style={{ color: "var(--text-muted)" }} />
                            </div>
                            <p style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>Select a workspace</p>
                            <p style={{ fontSize: 12.5 }}>Choose a workspace from the sidebar or build a new one to begin</p>
                        </div>
                    </div>
                )}
            </main>

            {/* Profile Settings Modal */}
            {showProfileModal && user && (
                <div className="overlay">
                    <div className="overlay-backdrop" onClick={() => setShowProfileModal(false)} />
                    <div className="overlay-content" style={{ maxWidth: 460, width: "100%", border: "1px solid var(--border-active)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
                            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>My Settings</h3>
                            <button onClick={() => setShowProfileModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-muted)", display: "flex" }}><X size={18} /></button>
                        </div>
                        
                        <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: 24 }}>
                            {/* Update Profile Form */}
                            <form onSubmit={handleUpdateProfile} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                <h4 style={{ fontSize: 11, fontWeight: 800, margin: 0, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Update Profile</h4>
                                <div>
                                    <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Email Address</label>
                                    <input type="text" value={user.email} disabled style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", cursor: "not-allowed" }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Display Name</label>
                                    <input type="text" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="Your Name" required />
                                </div>
                                <button type="submit" className="btn-primary" style={{ alignSelf: "flex-end", padding: "8px 16px", fontSize: 12 }}>Save Profile</button>
                            </form>

                            <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

                            {/* Change Password Form */}
                            <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                <h4 style={{ fontSize: 11, fontWeight: 800, margin: 0, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-secondary)" }}>Change Password</h4>
                                <div>
                                    <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>Current Password</label>
                                    <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="••••••••" required />
                                </div>
                                <div>
                                    <label style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>New Password</label>
                                    <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" required />
                                </div>
                                <button type="submit" className="btn-primary" style={{ alignSelf: "flex-end", padding: "8px 16px", fontSize: 12 }}>Change Password</button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Workspace Modal */}
            {showDeleteWsModal && currentWorkspace && (
                <div className="overlay">
                    <div className="overlay-backdrop" onClick={() => setShowDeleteWsModal(false)} />
                    <div className="overlay-content" style={{ maxWidth: 420, width: "100%", border: "1px solid var(--border-active)" }}>
                        <div style={{ padding: 24 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12, color: "var(--danger)", letterSpacing: "-0.01em" }}>Delete Workspace</h3>
                            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
                                Are you sure you want to permanently delete <strong>{currentWorkspace.name}</strong>? This action will cascade delete all boards, lists, cards, and activity logs. This cannot be undone.
                            </p>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                                <button onClick={() => setShowDeleteWsModal(false)} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }}>Cancel</button>
                                <button onClick={handleDeleteWorkspace} className="btn-primary" style={{ background: "var(--danger)", borderColor: "var(--danger)", padding: "8px 16px", fontSize: 12 }}>Delete</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Board Modal */}
            {showDeleteBoardModal && (
                <div className="overlay">
                    <div className="overlay-backdrop" onClick={() => setShowDeleteBoardModal(null)} />
                    <div className="overlay-content" style={{ maxWidth: 420, width: "100%", border: "1px solid var(--border-active)" }}>
                        <div style={{ padding: 24 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12, color: "var(--danger)", letterSpacing: "-0.01em" }}>Delete Board</h3>
                            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
                                Are you sure you want to delete this board? All lists, cards, comment threads, labels, and checklist items inside will be permanently lost.
                            </p>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                                <button onClick={() => setShowDeleteBoardModal(null)} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }}>Cancel</button>
                                <button onClick={() => handleDeleteBoard(showDeleteBoardModal)} className="btn-primary" style={{ background: "var(--danger)", borderColor: "var(--danger)", padding: "8px 16px", fontSize: 12 }}>Delete</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showMembers && currentWorkspace && (
                <WorkspaceMembersModal workspaceId={currentWorkspace.id} workspaceName={currentWorkspace.name} onClose={() => setShowMembers(false)} />
            )}
        </div>
    );
}
