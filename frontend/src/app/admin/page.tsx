"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import api from "@/lib/api";
import toast from "react-hot-toast";
import {
    Shield, Users, Briefcase, LayoutDashboard, CreditCard, Paperclip,
    Trash2, Activity, ArrowLeft, RefreshCw, Search, Loader2, Sun, Moon
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

interface Stats {
    totalUsers: number;
    totalWorkspaces: number;
    totalBoards: number;
    totalCards: number;
    totalAttachments: number;
}

interface AdminUser {
    id: string;
    name: string;
    email: string;
    isAdmin: boolean;
    avatarUrl: string | null;
    createdAt: string;
    _count: {
        workspacesOwned: number;
        cardsCreated: number;
        comments: number;
    };
}

interface LogEntry {
    id: string;
    action: string;
    details: string | null;
    createdAt: string;
    user: { name: string; email: string };
    card: { title: string };
}

export default function AdminPage() {
    const router = useRouter();
    const { user, isLoading, loadUser } = useAuthStore();
    const { theme, toggleTheme } = useTheme();

    const [stats, setStats] = useState<Stats | null>(null);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [activeTab, setActiveTab] = useState<"overview" | "users" | "logs">("overview");
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadUser(); }, []);

    useEffect(() => {
        if (!isLoading && (!user || !user.isAdmin)) {
            toast.error("Admin access required");
            router.replace("/dashboard");
        }
    }, [user, isLoading]);

    useEffect(() => {
        if (user?.isAdmin) fetchAll();
    }, [user]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [statsRes, usersRes, logsRes] = await Promise.all([
                api.get("/admin/stats"),
                api.get("/admin/users"),
                api.get("/admin/logs"),
            ]);
            setStats(statsRes.data);
            setUsers(usersRes.data);
            setLogs(logsRes.data);
        } catch (err) {
            console.error("Admin fetch error:", err);
            toast.error("Failed to load admin data");
        }
        setLoading(false);
    };

    const handleDeleteUser = async (userId: string, userName: string) => {
        if (!confirm(`Are you sure you want to delete "${userName}"? This will remove all their data permanently.`)) return;
        try {
            await api.delete(`/admin/users/${userId}`);
            setUsers(users.filter(u => u.id !== userId));
            toast.success(`User "${userName}" deleted`);
            // Refresh stats
            const { data } = await api.get("/admin/stats");
            setStats(data);
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete user");
        }
    };

    const filteredUsers = users.filter(u =>
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (isLoading || !user?.isAdmin) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={32} className="spinner" style={{ color: "var(--accent)" }} />
            </div>
        );
    }

    const statCards = stats ? [
        { label: "Total Users", value: stats.totalUsers, icon: <Users size={20} />, color: "#6366f1" },
        { label: "Workspaces", value: stats.totalWorkspaces, icon: <Briefcase size={20} />, color: "#10b981" },
        { label: "Boards", value: stats.totalBoards, icon: <LayoutDashboard size={20} />, color: "#f59e0b" },
        { label: "Cards", value: stats.totalCards, icon: <CreditCard size={20} />, color: "#ef4444" },
        { label: "Attachments", value: stats.totalAttachments, icon: <Paperclip size={20} />, color: "#a78bfa" },
    ] : [];

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-base)" }}>
            {/* Top Header Bar */}
            <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 32px", borderBottom: "1px solid var(--border)",
                background: "var(--bg-surface)", backdropFilter: "blur(20px)",
                position: "sticky", top: 0, zIndex: 50
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <button onClick={() => router.push("/dashboard")} className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        <ArrowLeft size={14} /> Back
                    </button>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 10,
                            background: "linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: "0 4px 12px rgba(239, 68, 68, 0.25)"
                        }}>
                            <Shield size={16} style={{ color: "white" }} />
                        </div>
                        <div>
                            <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Admin Panel</h1>
                            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>System Management Dashboard</p>
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button onClick={fetchAll} className="btn-ghost" style={{ padding: "6px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                        <RefreshCw size={13} /> Refresh
                    </button>
                    <button onClick={toggleTheme} className="btn-ghost" style={{ padding: 8 }}>
                        {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
                {/* Tab Navigation */}
                <div style={{ display: "flex", gap: 4, marginBottom: 32, background: "var(--bg-elevated)", padding: 4, borderRadius: "var(--radius)", border: "1px solid var(--border)", width: "fit-content" }}>
                    {(["overview", "users", "logs"] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            style={{
                                padding: "8px 20px", borderRadius: "var(--radius-sm)", fontSize: 12.5, fontWeight: 700,
                                background: activeTab === tab ? "var(--bg-card)" : "transparent",
                                border: activeTab === tab ? "1px solid var(--border-active)" : "1px solid transparent",
                                cursor: "pointer", color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                                transition: "all 150ms", display: "flex", alignItems: "center", gap: 6,
                                textTransform: "capitalize"
                            }}>
                            {tab === "overview" && <LayoutDashboard size={13} />}
                            {tab === "users" && <Users size={13} />}
                            {tab === "logs" && <Activity size={13} />}
                            {tab}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
                        <Loader2 size={28} className="spinner" style={{ color: "var(--accent)" }} />
                    </div>
                ) : (
                    <>
                        {/* OVERVIEW TAB */}
                        {activeTab === "overview" && (
                            <div>
                                <h2 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20, color: "var(--text-muted)" }}>System Overview</h2>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 40 }}>
                                    {statCards.map((s, i) => (
                                        <div key={i} className="glass-panel" style={{
                                            padding: "24px 20px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border)",
                                            display: "flex", flexDirection: "column", gap: 12
                                        }}>
                                            <div style={{
                                                width: 40, height: 40, borderRadius: 12,
                                                background: `${s.color}15`, color: s.color,
                                                display: "flex", alignItems: "center", justifyContent: "center"
                                            }}>
                                                {s.icon}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)" }}>{s.value}</div>
                                                <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Recent Activity Preview */}
                                <h2 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16, color: "var(--text-muted)" }}>Recent Platform Activity</h2>
                                <div className="glass-panel" style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden" }}>
                                    {logs.slice(0, 8).map((log) => (
                                        <div key={log.id} style={{
                                            display: "flex", alignItems: "flex-start", gap: 12,
                                            padding: "14px 20px", borderBottom: "1px solid var(--border)",
                                            fontSize: 12.5
                                        }}>
                                            <Activity size={13} style={{ marginTop: 3, flexShrink: 0, color: "var(--accent)" }} />
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{log.user?.name}</span>
                                                <span style={{ color: "var(--text-secondary)" }}> {log.action} </span>
                                                {log.details && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>— {log.details}</span>}
                                                <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 10.5 }}>on &quot;{log.card?.title}&quot;</span>
                                                <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{new Date(log.createdAt).toLocaleString()}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {logs.length === 0 && <p style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No activity logs yet</p>}
                                </div>
                            </div>
                        )}

                        {/* USERS TAB */}
                        {activeTab === "users" && (
                            <div>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                                    <h2 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", margin: 0 }}>
                                        Registered Users ({users.length})
                                    </h2>
                                    <div style={{ position: "relative", minWidth: 220 }}>
                                        <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                                        <input
                                            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search users..."
                                            style={{ paddingLeft: 36, fontSize: 12.5, padding: "8px 12px 8px 36px" }}
                                        />
                                    </div>
                                </div>

                                <div className="glass-panel" style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden" }}>
                                    {/* Table Header */}
                                    <div style={{
                                        display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 80px",
                                        padding: "12px 20px", background: "var(--bg-elevated)",
                                        borderBottom: "1px solid var(--border)", fontSize: 10.5,
                                        fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em",
                                        color: "var(--text-muted)"
                                    }}>
                                        <span>Name</span>
                                        <span>Email</span>
                                        <span>Role</span>
                                        <span>Joined</span>
                                        <span>Actions</span>
                                    </div>

                                    {/* User Rows */}
                                    {filteredUsers.map(u => (
                                        <div key={u.id} style={{
                                            display: "grid", gridTemplateColumns: "2fr 2fr 1fr 1fr 80px",
                                            padding: "14px 20px", borderBottom: "1px solid var(--border)",
                                            alignItems: "center", fontSize: 12.5,
                                            transition: "background 150ms"
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                                        onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                <div style={{
                                                    width: 28, height: 28, borderRadius: "50%",
                                                    background: u.isAdmin
                                                        ? "linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)"
                                                        : "linear-gradient(135deg, var(--accent) 0%, var(--accent-secondary) 100%)",
                                                    display: "flex", alignItems: "center", justifyContent: "center",
                                                    fontSize: 11, fontWeight: 800, color: "white", flexShrink: 0
                                                }}>
                                                    {u.isAdmin ? <Shield size={12} /> : u.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 700 }}>{u.name}</div>
                                                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                                        {u._count.workspacesOwned} workspaces · {u._count.cardsCreated} cards
                                                    </div>
                                                </div>
                                            </div>
                                            <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</span>
                                            <span>
                                                {u.isAdmin ? (
                                                    <span style={{ background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>Admin</span>
                                                ) : (
                                                    <span style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>Member</span>
                                                )}
                                            </span>
                                            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(u.createdAt).toLocaleDateString()}</span>
                                            <div>
                                                {!u.isAdmin && (
                                                    <button onClick={() => handleDeleteUser(u.id, u.name)}
                                                        style={{
                                                            width: 28, height: 28, borderRadius: 6,
                                                            display: "flex", alignItems: "center", justifyContent: "center",
                                                            background: "none", border: "none", cursor: "pointer",
                                                            color: "var(--text-muted)", transition: "all 150ms"
                                                        }}
                                                        onMouseOver={(e) => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                                                        onMouseOut={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
                                                        title="Delete user">
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {filteredUsers.length === 0 && (
                                        <p style={{ padding: "32px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No users found</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* LOGS TAB */}
                        {activeTab === "logs" && (
                            <div>
                                <h2 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 20, color: "var(--text-muted)" }}>
                                    Platform Activity Logs ({logs.length})
                                </h2>
                                <div className="glass-panel" style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", overflow: "hidden", maxHeight: "70vh", overflowY: "auto" }}>
                                    {logs.map((log) => (
                                        <div key={log.id} style={{
                                            display: "flex", alignItems: "flex-start", gap: 12,
                                            padding: "14px 20px", borderBottom: "1px solid var(--border)",
                                            fontSize: 12.5
                                        }}>
                                            <Activity size={13} style={{ marginTop: 3, flexShrink: 0, color: "var(--accent)" }} />
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{log.user?.name}</span>
                                                <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 6 }}>({log.user?.email})</span>
                                                <span style={{ color: "var(--text-secondary)" }}> {log.action} </span>
                                                {log.details && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>— {log.details}</span>}
                                                <span style={{ color: "var(--text-muted)", marginLeft: 8, fontSize: 10.5 }}>on &quot;{log.card?.title}&quot;</span>
                                            </div>
                                            <span style={{ fontSize: 10.5, color: "var(--text-muted)", flexShrink: 0, whiteSpace: "nowrap" }}>{new Date(log.createdAt).toLocaleString()}</span>
                                        </div>
                                    ))}
                                    {logs.length === 0 && <p style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No activity logs recorded yet</p>}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
