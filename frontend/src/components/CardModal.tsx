"use client";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { X, Calendar, MessageSquare, Tag, CheckSquare, Users, Activity, Plus, Trash2, Check } from "lucide-react";
import { Card } from "@/store/board";

const PRIORITY_COLORS: Record<string, string> = { URGENT: "#f87171", HIGH: "#fbbf24", MEDIUM: "#5b9bf5", LOW: "#34d399" };
const LABEL_PRESETS = ["#5b9bf5", "#f87171", "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee", "#84cc16", "#fb923c", "#818cf8"];

interface Props { card: Card; workspaceId: string; boardId: string; onClose: () => void; onRefresh: () => void; }

export default function CardModal({ card, workspaceId: wId, boardId: bId, onClose, onRefresh }: Props) {
    const base = `/workspaces/${wId}/boards/${bId}`;
    const cardBase = `${base}/cards/${card.id}`;
    const handleClose = () => { onRefresh(); onClose(); };

    const [desc, setDesc] = useState(card.description || "");
    const [editingDesc, setEditingDesc] = useState(false);
    const [priority, setPriority] = useState(card.priority || "");
    const [dueDate, setDueDate] = useState(card.dueDate?.slice(0, 10) || "");
    const [activeTab, setActiveTab] = useState<"comments" | "activity">("comments");
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState("");
    const [labels, setLabels] = useState<any[]>([]);
    const [boardLabels, setBoardLabels] = useState<any[]>([]);
    const [showLabelPicker, setShowLabelPicker] = useState(false);
    const [newLabelName, setNewLabelName] = useState("");
    const [newLabelColor, setNewLabelColor] = useState(LABEL_PRESETS[0]);
    const [checklists, setChecklists] = useState<any[]>([]);
    const [newChecklistTitle, setNewChecklistTitle] = useState("");
    const [showAddChecklist, setShowAddChecklist] = useState(false);
    const [members, setMembers] = useState<any[]>([]);
    const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
    const [showMemberPicker, setShowMemberPicker] = useState(false);
    const [activity, setActivity] = useState<any[]>([]);

    useEffect(() => {
        api.get(`${cardBase}/comments`).then(r => setComments(r.data)).catch(() => { });
        api.get(`${cardBase}/checklists`).then(r => setChecklists(r.data)).catch(() => { });
        api.get(`${cardBase}/members`).then(r => setMembers(r.data)).catch(() => { });
        api.get(`${cardBase}/activity`).then(r => setActivity(r.data)).catch(() => { });
        api.get(`${base}/labels`).then(r => setBoardLabels(r.data)).catch(() => { });
        api.get(`/workspaces/${wId}`).then(r => setWorkspaceMembers(r.data.members || [])).catch(() => { });
        setLabels(card.labels || []);
    }, [card.id]);

    const saveDesc = async () => { try { await api.patch(cardBase, { description: desc }); setEditingDesc(false); toast.success("Saved"); } catch { toast.error("Failed"); } };
    const savePriority = async (p: string) => { setPriority(p); try { await api.patch(cardBase, { priority: p || null }); } catch { toast.error("Failed"); } };
    const saveDueDate = async (d: string) => { setDueDate(d); try { await api.patch(cardBase, { dueDate: d ? new Date(d).toISOString() : null }); } catch { toast.error("Failed"); } };
    const addComment = async (e: React.FormEvent) => { e.preventDefault(); if (!newComment.trim()) return; try { const { data } = await api.post(`${cardBase}/comments`, { content: newComment.trim() }); setComments([data, ...comments]); setNewComment(""); } catch { toast.error("Failed"); } };
    const deleteComment = async (id: string) => { try { await api.delete(`${cardBase}/comments/${id}`); setComments(comments.filter(c => c.id !== id)); } catch { toast.error("Failed"); } };
    const createAndAssignLabel = async () => { if (!newLabelName.trim()) return; try { const { data: label } = await api.post(`${base}/labels`, { name: newLabelName.trim(), color: newLabelColor }); const { data: assignment } = await api.post(`${cardBase}/labels`, { labelId: label.id }); setLabels([...labels, { ...assignment, label }]); setBoardLabels([...boardLabels, label]); setNewLabelName(""); } catch { toast.error("Failed"); } };
    const toggleLabel = async (label: any) => { const assigned = labels.some(l => l.labelId === label.id); try { if (assigned) { await api.delete(`${cardBase}/labels/${label.id}`); setLabels(labels.filter(l => l.labelId !== label.id)); } else { const { data } = await api.post(`${cardBase}/labels`, { labelId: label.id }); setLabels([...labels, { ...data, label }]); } } catch { toast.error("Failed"); } };
    const addChecklist = async () => { if (!newChecklistTitle.trim()) return; try { const { data } = await api.post(`${cardBase}/checklists`, { title: newChecklistTitle.trim() }); setChecklists([...checklists, data]); setNewChecklistTitle(""); setShowAddChecklist(false); } catch { toast.error("Failed"); } };
    const deleteChecklist = async (id: string) => { try { await api.delete(`${cardBase}/checklists/${id}`); setChecklists(checklists.filter(c => c.id !== id)); } catch { toast.error("Failed"); } };
    const addChecklistItem = async (clId: string, content: string) => { try { const { data } = await api.post(`${cardBase}/checklists/${clId}/items`, { content }); setChecklists(checklists.map(cl => cl.id === clId ? { ...cl, items: [...cl.items, data] } : cl)); } catch { toast.error("Failed"); } };
    const toggleChecklistItem = async (clId: string, itemId: string, isChecked: boolean) => { try { await api.patch(`${cardBase}/checklists/${clId}/items/${itemId}`, { isChecked: !isChecked }); setChecklists(checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.map((it: any) => it.id === itemId ? { ...it, isChecked: !isChecked } : it) } : cl)); } catch { toast.error("Failed"); } };
    const deleteChecklistItem = async (clId: string, itemId: string) => { try { await api.delete(`${cardBase}/checklists/${clId}/items/${itemId}`); setChecklists(checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.filter((it: any) => it.id !== itemId) } : cl)); } catch { toast.error("Failed"); } };
    const progress = (cl: any) => cl.items?.length ? Math.round((cl.items.filter((i: any) => i.isChecked).length / cl.items.length) * 100) : 0;

    return (
        <div className="overlay" onClick={handleClose}>
            <div className="overlay-backdrop" />
            <div className="overlay-content" style={{ width: "100%", maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: 24, borderBottom: "1px solid var(--border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ fontSize: 18, fontWeight: 700 }}>{card.title}</h2>
                        {labels.length > 0 && (
                            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                                {labels.map((cl: any) => (
                                    <span key={cl.labelId || cl.label?.id} className="badge" style={{ background: (cl.label?.color || "#636b7d") + "20", color: cl.label?.color || "#636b7d" }}>{cl.label?.name}</span>
                                ))}
                            </div>
                        )}
                    </div>
                    <button onClick={handleClose} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", marginLeft: 16 }}><X size={16} /></button>
                </div>

                <div style={{ display: "flex", minHeight: 400 }}>
                    {/* Main content */}
                    <div style={{ flex: 1, padding: 24, overflowY: "auto", maxHeight: "65vh", borderRight: "1px solid var(--border)" }}>
                        {/* Priority + Due */}
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
                            <div style={{ flex: 1, minWidth: 140 }}>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 8, color: "var(--text-muted)" }}>Priority</label>
                                <select value={priority} onChange={(e) => savePriority(e.target.value)} style={{ fontSize: 13 }}>
                                    <option value="">None</option>
                                    {["LOW", "MEDIUM", "HIGH", "URGENT"].map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div style={{ flex: 1, minWidth: 140 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, marginBottom: 8, color: "var(--text-muted)" }}><Calendar size={11} /> Due Date</label>
                                <input type="date" value={dueDate} onChange={(e) => saveDueDate(e.target.value)} style={{ fontSize: 13 }} />
                            </div>
                        </div>

                        {/* Description */}
                        <div style={{ marginBottom: 24 }}>
                            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, color: "var(--text-muted)" }}>Description</h3>
                            {editingDesc ? (
                                <div>
                                    <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} style={{ fontSize: 13, marginBottom: 8 }} placeholder="Add a description..." autoFocus />
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button onClick={saveDesc} className="btn-primary" style={{ fontSize: 12 }}>Save</button>
                                        <button onClick={() => { setEditingDesc(false); setDesc(card.description || ""); }} className="btn-ghost" style={{ fontSize: 12 }}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div onClick={() => setEditingDesc(true)}
                                    style={{ fontSize: 13, padding: 16, borderRadius: 8, cursor: "pointer", minHeight: 60, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: desc ? "var(--text-primary)" : "var(--text-muted)" }}>
                                    {desc || "Click to add description..."}
                                </div>
                            )}
                        </div>

                        {/* Checklists */}
                        {checklists.length > 0 && (
                            <div style={{ marginBottom: 24 }}>
                                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}><CheckSquare size={12} /> Checklists</h3>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    {checklists.map((cl) => (
                                        <ChecklistSection key={cl.id} checklist={cl} onToggleItem={(itemId, checked) => toggleChecklistItem(cl.id, itemId, checked)} onAddItem={(content) => addChecklistItem(cl.id, content)} onDeleteItem={(itemId) => deleteChecklistItem(cl.id, itemId)} onDelete={() => deleteChecklist(cl.id)} progress={progress(cl)} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tabs */}
                        <div>
                            <div style={{ display: "flex", gap: 4, marginBottom: 16, padding: 4, borderRadius: 8, background: "var(--bg-elevated)" }}>
                                {(["comments", "activity"] as const).map(tab => (
                                    <button key={tab} onClick={() => setActiveTab(tab)}
                                        style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: 6, textTransform: "capitalize", border: "none", cursor: "pointer", background: activeTab === tab ? "var(--bg-card)" : "transparent", color: activeTab === tab ? "var(--text-primary)" : "var(--text-muted)", boxShadow: activeTab === tab ? "var(--shadow-sm)" : "none" }}>
                                        {tab === "comments" ? <><MessageSquare size={11} style={{ marginRight: 4 }} />Comments ({comments.length})</> : <><Activity size={11} style={{ marginRight: 4 }} />Activity ({activity.length})</>}
                                    </button>
                                ))}
                            </div>

                            {activeTab === "comments" ? (
                                <div>
                                    <form onSubmit={addComment} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                                        <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment..." style={{ flex: 1, fontSize: 13 }} />
                                        <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "8px 16px" }}>Send</button>
                                    </form>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {comments.map((c) => (
                                            <div key={c.id} style={{ padding: 12, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                        <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, background: "var(--accent)", color: "white" }}>{(c.user?.name || "U").charAt(0).toUpperCase()}</div>
                                                        <span style={{ fontSize: 12, fontWeight: 700 }}>{c.user?.name || "User"}</span>
                                                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{new Date(c.createdAt).toLocaleString()}</span>
                                                    </div>
                                                    <button onClick={() => deleteComment(c.id)} style={{ width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--danger)", opacity: 0.6 }}><Trash2 size={12} /></button>
                                                </div>
                                                <p style={{ fontSize: 13, paddingLeft: 32, color: "var(--text-secondary)" }}>{c.content}</p>
                                            </div>
                                        ))}
                                        {comments.length === 0 && <p style={{ fontSize: 12, textAlign: "center", padding: "24px 0", color: "var(--text-muted)" }}>No comments yet</p>}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {activity.map((a: any) => (
                                        <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", fontSize: 12, color: "var(--text-secondary)" }}>
                                            <Activity size={12} style={{ marginTop: 2, flexShrink: 0, color: "var(--accent)" }} />
                                            <div><span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{a.user?.name}</span> {a.action} {a.details && <span style={{ color: "var(--text-muted)" }}>— {a.details}</span>}<div style={{ fontSize: 10, marginTop: 2, color: "var(--text-muted)" }}>{new Date(a.createdAt).toLocaleString()}</div></div>
                                        </div>
                                    ))}
                                    {activity.length === 0 && <p style={{ fontSize: 12, textAlign: "center", padding: "24px 0", color: "var(--text-muted)" }}>No activity yet</p>}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar */}
                    <div style={{ width: 200, padding: 20, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 8, color: "var(--text-muted)" }}>Add to card</p>

                        {/* Labels */}
                        <button onClick={() => setShowLabelPicker(!showLabelPicker)} style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-primary)" }}><Tag size={13} /> Labels</button>
                        {showLabelPicker && (
                            <div style={{ borderRadius: 8, padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-hover)", display: "flex", flexDirection: "column", gap: 6 }}>
                                {boardLabels.map((label: any) => (
                                    <button key={label.id} onClick={() => toggleLabel(label)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 12, background: "none", border: "none", cursor: "pointer", color: label.color }}>
                                        <div style={{ width: 16, height: 16, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: label.color + "25", border: `1.5px solid ${label.color}` }}>
                                            {labels.some(l => l.labelId === label.id) && <Check size={9} style={{ color: label.color }} />}
                                        </div>
                                        {label.name}
                                    </button>
                                ))}
                                <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)" }}>
                                    <input type="text" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} placeholder="Label name..." style={{ fontSize: 12, marginBottom: 8 }} />
                                    <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
                                        {LABEL_PRESETS.map(c => (
                                            <button key={c} onClick={() => setNewLabelColor(c)} style={{ width: 20, height: 20, borderRadius: "50%", background: c, border: newLabelColor === c ? "2px solid white" : "2px solid transparent", cursor: "pointer", transform: newLabelColor === c ? "scale(1.2)" : "scale(1)" }} />
                                        ))}
                                    </div>
                                    <button onClick={createAndAssignLabel} className="btn-primary" style={{ width: "100%", fontSize: 12, padding: "6px 0" }}>Create Label</button>
                                </div>
                            </div>
                        )}

                        {/* Checklist */}
                        <button onClick={() => setShowAddChecklist(!showAddChecklist)} style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-primary)" }}><CheckSquare size={13} /> Checklist</button>
                        {showAddChecklist && (
                            <div style={{ borderRadius: 8, padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-hover)" }}>
                                <input type="text" value={newChecklistTitle} onChange={(e) => setNewChecklistTitle(e.target.value)} placeholder="Checklist title" style={{ fontSize: 12, marginBottom: 8 }} autoFocus />
                                <button onClick={addChecklist} className="btn-primary" style={{ width: "100%", fontSize: 12, padding: "6px 0" }}>Add</button>
                            </div>
                        )}

                        {/* Members */}
                        <button onClick={() => setShowMemberPicker(!showMemberPicker)} style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-primary)" }}><Users size={13} /> Members</button>
                        {showMemberPicker && (
                            <div style={{ borderRadius: 8, padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-hover)", display: "flex", flexDirection: "column", gap: 4 }}>
                                {workspaceMembers.map((wm: any) => {
                                    const isAssigned = members.some(m => m.userId === wm.userId);
                                    return (
                                        <button key={wm.userId} onClick={async () => { try { if (isAssigned) { await api.delete(`${cardBase}/members/${wm.userId}`); setMembers(members.filter(m => m.userId !== wm.userId)); } else { const { data } = await api.post(`${cardBase}/members`, { userId: wm.userId }); setMembers([...members, data]); } } catch { toast.error("Failed"); } }}
                                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>
                                            <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0, background: isAssigned ? "var(--accent)" : "var(--bg-card)", color: "white" }}>
                                                {isAssigned ? <Check size={10} /> : wm.user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wm.user.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {members.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 8 }}>
                                {members.map((m: any) => (
                                    <div key={m.userId} style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: "var(--accent)", color: "white", boxShadow: "0 0 0 2px var(--bg-surface)" }} title={m.user?.name}>{(m.user?.name || "U").charAt(0).toUpperCase()}</div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---- Checklist Section ---- */
function ChecklistSection({ checklist, onToggleItem, onAddItem, onDeleteItem, onDelete, progress }: {
    checklist: any; onToggleItem: (id: string, checked: boolean) => void; onAddItem: (content: string) => void; onDeleteItem: (id: string) => void; onDelete: () => void; progress: number;
}) {
    const [showAdd, setShowAdd] = useState(false);
    const [itemContent, setItemContent] = useState("");
    const handleAdd = (e: React.FormEvent) => { e.preventDefault(); if (!itemContent.trim()) return; onAddItem(itemContent.trim()); setItemContent(""); };

    return (
        <div style={{ borderRadius: 8, padding: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700 }}>{checklist.title}</h4>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: progress === 100 ? "var(--success)" : "var(--text-muted)" }}>{progress}%</span>
                    <button onClick={onDelete} style={{ width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}><Trash2 size={12} /></button>
                </div>
            </div>
            <div className="progress-track" style={{ marginBottom: 12 }}>
                <div className="progress-fill" style={{ width: `${progress}%`, background: progress === 100 ? "var(--success)" : "var(--accent)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {checklist.items?.map((item: any) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                        <button onClick={() => onToggleItem(item.id, item.isChecked)} style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: item.isChecked ? "var(--accent)" : "transparent", border: `2px solid ${item.isChecked ? "var(--accent)" : "var(--text-muted)"}`, cursor: "pointer" }}>
                            {item.isChecked && <Check size={9} color="white" />}
                        </button>
                        <span style={{ flex: 1, fontSize: 13, textDecoration: item.isChecked ? "line-through" : "none", color: item.isChecked ? "var(--text-muted)" : "var(--text-primary)" }}>{item.content}</span>
                        <button onClick={() => onDeleteItem(item.id)} style={{ width: 20, height: 20, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", opacity: 0.5 }}><X size={11} /></button>
                    </div>
                ))}
            </div>
            {showAdd ? (
                <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <input type="text" value={itemContent} onChange={(e) => setItemContent(e.target.value)} placeholder="Add item..." style={{ flex: 1, fontSize: 12 }} autoFocus />
                    <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "6px 12px" }}>Add</button>
                    <button type="button" onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}><X size={12} /></button>
                </form>
            ) : (
                <button onClick={() => setShowAdd(true)} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, marginTop: 8, padding: "4px 0", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                    <Plus size={12} /> Add an item
                </button>
            )}
        </div>
    );
}
