"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { X, UserPlus, Crown, Shield, Trash2, Loader2 } from "lucide-react";

interface Member { userId: string; role: string; user: { id: string; name: string; email: string; }; }
interface Props { workspaceId: string; workspaceName: string; onClose: () => void; }

export default function WorkspaceMembersModal({ workspaceId, workspaceName, onClose }: Props) {
    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
    const [inviting, setInviting] = useState(false);

    useEffect(() => { loadMembers(); }, []);

    const loadMembers = async () => {
        try { const { data } = await api.get(`/workspaces/${workspaceId}`); setMembers(data.members || []); }
        catch { toast.error("Failed to load members"); }
        setLoading(false);
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;
        setInviting(true);
        try { await api.post(`/workspaces/${workspaceId}/invite`, { email: inviteEmail.trim(), role: inviteRole }); toast.success(`Invited ${inviteEmail}`); setInviteEmail(""); loadMembers(); }
        catch (err: any) { toast.error(err.response?.data?.message || "Failed to invite"); }
        setInviting(false);
    };

    const changeRole = async (memberId: string, role: string) => {
        try { await api.patch(`/workspaces/${workspaceId}/members/${memberId}`, { role }); setMembers(members.map(m => m.userId === memberId ? { ...m, role } : m)); toast.success("Role updated"); }
        catch (err: any) { toast.error(err.response?.data?.message || "Failed"); }
    };

    const removeMember = async (memberId: string, name: string) => {
        if (!confirm(`Remove ${name}?`)) return;
        try { await api.delete(`/workspaces/${workspaceId}/members/${memberId}`); setMembers(members.filter(m => m.userId !== memberId)); toast.success("Removed"); }
        catch (err: any) { toast.error(err.response?.data?.message || "Failed"); }
    };

    return (
        <div className="overlay">
            <div className="overlay-backdrop" onClick={onClose} />
            <div className="overlay-content" style={{ width: "100%", maxWidth: 500, border: "1px solid var(--border-active)" }} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
                    <div>
                        <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, letterSpacing: "-0.01em" }}>Workspace Members</h2>
                        <p style={{ fontSize: 11.5, marginTop: 4, color: "var(--text-muted)", margin: 0 }}>{workspaceName}</p>
                    </div>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", transition: "all 150ms var(--ease)" }} onMouseOver={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }} onMouseOut={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "none"; }}><X size={16} /></button>
                </div>

                {/* Invite */}
                <form onSubmit={handleInvite} style={{ padding: 24, borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}><UserPlus size={12} /> Invite colleague by email</label>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@example.com" style={{ flex: 1, fontSize: 13, padding: "8px 12px" }} />
                        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "MEMBER" | "ADMIN")} style={{ width: "auto", minWidth: 95, fontSize: 12, padding: "8px 28px 8px 12px" }}>
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                        <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "8px 16px" }} disabled={inviting}>
                            {inviting ? <Loader2 size={14} className="spinner" /> : "Invite"}
                        </button>
                    </div>
                </form>

                {/* Members List */}
                <div style={{ padding: 24, maxHeight: "50vh", overflowY: "auto" }}>
                    <p style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 14, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current Members ({members.length})</p>
                    {loading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}><Loader2 size={22} className="spinner" style={{ color: "var(--accent)" }} /></div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {members.map((m) => (
                                <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: "var(--radius)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                                    <div style={{
                                        width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center",
                                        justifyContent: "center", fontSize: 11.5, fontWeight: 800, flexShrink: 0,
                                        background: "var(--accent)", color: "white"
                                    }}>
                                        {m.user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{m.user.name}</div>
                                        <div style={{ fontSize: 10.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{m.user.email}</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        {m.role === "ADMIN" ? (
                                            <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid rgba(95, 98, 241, 0.2)", fontSize: 9.5 }}><Crown size={9} /> Admin</span>
                                        ) : (
                                            <span className="badge" style={{ background: "var(--bg-card)", color: "var(--text-muted)", border: "1px solid var(--border)", fontSize: 9.5 }}><Shield size={9} /> Member</span>
                                        )}
                                        <select value={m.role} onChange={(e) => changeRole(m.userId, e.target.value)} style={{ fontSize: 11, padding: "4px 22px 4px 8px", borderRadius: 6, width: "auto", minWidth: 85, background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                                            <option value="MEMBER">Member</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                        <button onClick={() => removeMember(m.userId, m.user.name)} style={{ width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", transition: "color 150ms" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--danger)"} onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}><Trash2 size={13} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
