"use client";
import { useEffect, useState, useRef } from "react";
import { Bell, Trash2, Check, Loader2 } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";

export default function NotificationDropdown() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const fetchUnreadCount = async () => {
        try {
            const { data } = await api.get("/notifications/unread-count");
            setUnreadCount(data.count);
        } catch { }
    };

    const fetchNotifications = async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/notifications");
            setNotifications(data);
        } catch { }
        setLoading(false);
    };

    useEffect(() => {
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30000); // Poll every 30 seconds
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleToggle = () => {
        if (!isOpen) {
            fetchNotifications();
        }
        setIsOpen(!isOpen);
    };

    const handleMarkAsRead = async (id: string, isRead: boolean) => {
        if (isRead) return;
        try {
            await api.patch(`/notifications/${id}/read`);
            setNotifications(notifications.map(n => n.id === id ? { ...n, isRead: true } : n));
            fetchUnreadCount();
        } catch { }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await api.patch("/notifications/read-all");
            setNotifications(notifications.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
            toast.success("All marked as read");
        } catch {
            toast.error("Failed");
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        try {
            await api.delete(`/notifications/${id}`);
            setNotifications(notifications.filter(n => n.id !== id));
            fetchUnreadCount();
        } catch {
            toast.error("Failed to delete notification");
        }
    };

    return (
        <div ref={dropdownRef} style={{ position: "relative" }}>
            <button onClick={handleToggle}
                    style={{
                        position: "relative", background: "none", border: "none", cursor: "pointer",
                        color: "var(--text-secondary)", padding: 8, borderRadius: 8, display: "flex", transition: "all 150ms var(--ease)"
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                    onMouseOut={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            >
                <Bell size={18} />
                {unreadCount > 0 && (
                    <span style={{
                        position: "absolute", top: 2, right: 2, background: "var(--accent)", color: "white",
                        borderRadius: "50%", fontSize: 9, fontWeight: 800, height: 15, width: 15,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 0 0 2px var(--bg-surface)"
                    }}>
                        {unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div style={{
                    position: "absolute", right: 0, marginTop: 8, width: 330, background: "var(--bg-card)",
                    border: "1px solid var(--border-active)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)",
                    zIndex: 1000, display: "flex", flexDirection: "column", maxHeight: 420, overflow: "hidden"
                }}>
                    <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>Notifications</span>
                        {unreadCount > 0 && (
                            <button onClick={handleMarkAllAsRead} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "color 150ms" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--accent-hover)"} onMouseOut={(e) => e.currentTarget.style.color = "var(--accent)"}>Mark all read</button>
                        )}
                    </div>

                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
                        {loading ? (
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: 32 }}><Loader2 size={18} className="spinner" style={{ color: "var(--accent)" }} /></div>
                        ) : notifications.length > 0 ? (
                            notifications.map((n) => (
                                <div key={n.id} onClick={() => handleMarkAsRead(n.id, n.isRead)} style={{
                                    display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px",
                                    borderBottom: "1px solid var(--border)", cursor: "pointer",
                                    background: n.isRead ? "transparent" : "var(--accent-soft)",
                                    transition: "background 180ms var(--ease)"
                                }}>
                                    <div style={{ flex: 1, fontSize: 12.5 }}>
                                        <p style={{ margin: 0, fontWeight: n.isRead ? 500 : 700, color: n.isRead ? "var(--text-secondary)" : "var(--text-primary)", lineHeight: 1.45 }}>{n.message}</p>
                                        <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 5, display: "block" }}>{new Date(n.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <button onClick={(e) => handleDelete(e, n.id)} style={{ background: "none", border: "none", color: "var(--text-muted)", padding: 4, cursor: "pointer", borderRadius: 4, display: "flex", transition: "color 150ms" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--danger)"} onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)", fontSize: 12.5 }}>No notifications yet</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
