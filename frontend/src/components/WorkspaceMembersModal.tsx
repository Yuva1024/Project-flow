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
        <div className="overlay" onClick={onClose}>
            <div className="overlay-backdrop" />
            <div className="overlay-content" style={{ width: "100%", maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 24, borderBottom: "1px solid var(--border)" }}>
                    <div>
                        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Workspace Members</h2>
                        <p style={{ fontSize: 12, marginTop: 4, color: "var(--text-muted)" }}>{workspaceName}</p>
                    </div>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}><X size={16} /></button>
                </div>

                {/* Invite */}
                <form onSubmit={handleInvite} style={{ padding: 24, borderBottom: "1px solid var(--border)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-muted)" }}><UserPlus size={11} /> Invite by email</label>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@example.com" style={{ flex: 1, fontSize: 13 }} />
                        <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "MEMBER" | "ADMIN")} style={{ width: "auto", minWidth: 90, fontSize: 12 }}>
                            <option value="MEMBER">Member</option>
                            <option value="ADMIN">Admin</option>
                        </select>
                        <button type="submit" className="btn-primary" style={{ fontSize: 12 }} disabled={inviting}>
                            {inviting ? <Loader2 size={14} className="spinner" /> : "Invite"}
                        </button>
                    </div>
                </form>

                {/* Members */}
                <div style={{ padding: 24 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 16, color: "var(--text-muted)" }}>{members.length} member{members.length !== 1 && "s"}</p>
                    {loading ? (
                        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}><Loader2 size={24} className="spinner" style={{ color: "var(--accent)" }} /></div>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {members.map((m) => (
                                <div key={m.userId} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                                    <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0, background: "var(--accent)", color: "white" }}>{m.user.name.charAt(0).toUpperCase()}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.user.name}</div>
                                        <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.user.email}</div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        {m.role === "ADMIN" ? (
                                            <span className="badge" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Crown size={10} /> Admin</span>
                                        ) : (
                                            <span className="badge" style={{ background: "var(--bg-card)", color: "var(--text-muted)" }}><Shield size={10} /> Member</span>
                                        )}
                                        <select value={m.role} onChange={(e) => changeRole(m.userId, e.target.value)} style={{ fontSize: 10, padding: "4px 6px", borderRadius: 4, width: "auto", minWidth: 70, background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                                            <option value="MEMBER">Member</option>
                                            <option value="ADMIN">Admin</option>
                                        </select>
                                        <button onClick={() => removeMember(m.userId, m.user.name)} style={{ width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--danger)" }}><Trash2 size={13} /></button>
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
