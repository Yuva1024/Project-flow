"use client";
import { useEffect, useState, useRef } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { X, Calendar, MessageSquare, Tag, CheckSquare, Users, Activity, Plus, Trash2, Check, Edit2, AlertCircle, ChevronDown, ChevronUp, Paperclip, Download, FileText, Image as ImageIcon, Video, UploadCloud, File as FileIcon, Box, Maximize2, Eye } from "lucide-react";
import { Card } from "@/store/board";
import Three3DViewer from "@/components/Three3DViewer";
const LABEL_PRESETS = ["#5f62f1", "#ef4444", "#10b981", "#f59e0b", "#a78bfa", "#f472b6", "#22d3ee", "#84cc16", "#fb923c", "#818cf8"];
const SHOW_3D_VIEWER = true; // Set to true to activate 3D Model Viewer feature


interface Props { card: Card; workspaceId: string; boardId: string; onClose: () => void; onRefresh: () => void; }

export default function CardModal({ card, workspaceId: wId, boardId: bId, onClose, onRefresh }: Props) {
    const base = `/workspaces/${wId}/boards/${bId}`;
    const cardBase = `${base}/cards/${card.id}`;
    const handleClose = () => { onRefresh(); onClose(); };

    // Card state
    const [cardTitle, setCardTitle] = useState(card.title);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [desc, setDesc] = useState(card.description || "");
    const [editingDesc, setEditingDesc] = useState(false);
    const [priority, setPriority] = useState(card.priority || "");
    const [dueDate, setDueDate] = useState(card.dueDate?.slice(0, 10) || "");
    
    // Comments & tabs
    const [activeTab, setActiveTab] = useState<"comments" | "activity">("comments");
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState("");
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState("");

    // Labels
    const [labels, setLabels] = useState<any[]>([]);
    const [boardLabels, setBoardLabels] = useState<any[]>([]);
    const [showLabelPicker, setShowLabelPicker] = useState(false);
    const [newLabelName, setNewLabelName] = useState("");
    const [newLabelColor, setNewLabelColor] = useState(LABEL_PRESETS[0]);
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);

    // Checklists & Members & Activity
    const [checklists, setChecklists] = useState<any[]>([]);
    const [newChecklistTitle, setNewChecklistTitle] = useState("");
    const [showAddChecklist, setShowAddChecklist] = useState(false);
    const [members, setMembers] = useState<any[]>([]);
    const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
    const [showMemberPicker, setShowMemberPicker] = useState(false);
    const [activity, setActivity] = useState<any[]>([]);

    // 3D Model Viewer Sections State
    interface Model3DSection { id: string; title: string; modelUrl: string; autoRotate: boolean; attachmentId?: string; }
    const [model3DSections, setModel3DSections] = useState<Model3DSection[]>((card.model3DSections as Model3DSection[]) || []);
    const [new3DSectionName, setNew3DSectionName] = useState("");
    const [show3DSectionForm, setShow3DSectionForm] = useState(false);

    const save3DSections = async (sections: Model3DSection[]) => {
        setModel3DSections(sections);
        try {
            await api.patch(cardBase, { model3DSections: sections });
        } catch {
            toast.error("Failed to save 3D sections");
        }
    };

    const handleCreate3DSection = (e: React.FormEvent) => {
        e.preventDefault();
        if (!new3DSectionName.trim()) return toast.error("Please enter a name for the 3D model section");
        const newSec: Model3DSection = {
            id: Date.now().toString(),
            title: new3DSectionName.trim(),
            modelUrl: "",
            autoRotate: false
        };
        const updated = [...model3DSections, newSec];
        save3DSections(updated);
        setNew3DSectionName("");
        setShow3DSectionForm(false);
        toast.success(`Created 3D section "${newSec.title}" below attachments`);
    };

    const handleDelete3DSection = (secId: string) => {
        const updated = model3DSections.filter(s => s.id !== secId);
        save3DSections(updated);
        toast.success("3D Section deleted");
    };

    const handleUpdate3DSectionModel = (secId: string, modelUrl: string, attachmentId?: string) => {
        const updated = model3DSections.map(s => s.id === secId ? { ...s, modelUrl, attachmentId } : s);
        save3DSections(updated);
    };

    const handleToggleAutoRotate = (secId: string) => {
        const updated = model3DSections.map(s => s.id === secId ? { ...s, autoRotate: !s.autoRotate } : s);
        save3DSections(updated);
    };

    // Attachments & Drag-Drop State
    const [attachments, setAttachments] = useState<any[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);

    useEffect(() => {
        api.get(`${cardBase}/comments`).then(r => setComments(r.data)).catch(() => { });
        api.get(`${cardBase}/checklists`).then(r => setChecklists(r.data)).catch(() => { });
        api.get(`${cardBase}/members`).then(r => setMembers(r.data)).catch(() => { });
        api.get(`${cardBase}/activity`).then(r => setActivity(r.data)).catch(() => { });
        api.get(`${cardBase}/attachments`).then(r => setAttachments(r.data)).catch(() => { });
        api.get(`${base}/labels`).then(r => setBoardLabels(r.data)).catch(() => { });
        api.get(`/workspaces/${wId}`).then(r => setWorkspaceMembers(r.data.members || [])).catch(() => { });
        setLabels(card.labels || []);
    }, [card.id]);

    // Lightbox & Direct Download state
    const [lightboxMedia, setLightboxMedia] = useState<{ type: 'image' | 'video' | '3d'; url: string; title: string } | null>(null);

    const forceDownload = async (fileUrl: string, fileName: string) => {
        try {
            toast.loading(`Downloading ${fileName}...`, { id: "downloading" });
            const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(fileName)}`;
            const a = document.createElement('a');
            a.href = proxyUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast.success(`Started downloading ${fileName}`, { id: "downloading" });
        } catch {
            window.open(fileUrl, '_blank');
            toast.dismiss("downloading");
        }
    };

    const uploadAbortControllerRef = useRef<AbortController | null>(null);

    const cancelUpload = () => {
        if (uploadAbortControllerRef.current) {
            uploadAbortControllerRef.current.abort();
            uploadAbortControllerRef.current = null;
            setIsUploading(false);
            toast.error("Upload canceled");
        }
    };

    const handleFileUpload = async (file: File) => {
        if (!file) return null;
        setIsUploading(true);
        const controller = new AbortController();
        uploadAbortControllerRef.current = controller;

        const formData = new FormData();
        formData.append('file', file);
        try {
            const { data } = await api.post(`${cardBase}/attachments`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                signal: controller.signal,
            });
            setAttachments(prev => [data, ...prev]);
            toast.success(`Attached "${file.name}"`);
            return data;
        } catch (err: any) {
            if (err?.name === 'CanceledError' || err?.message === 'canceled' || err?.code === 'ERR_CANCELED') {
                return null;
            }
            toast.error("Failed to upload file");
            return null;
        } finally {
            setIsUploading(false);
            uploadAbortControllerRef.current = null;
        }
    };

    const handleDeleteAttachment = async (id: string) => {
        try {
            await api.delete(`${cardBase}/attachments/${id}`);
            setAttachments(attachments.filter(a => a.id !== id));

            // If any 3D section was linked to this deleted attachment, reset its model
            const updatedSections = model3DSections.map(sec =>
                sec.attachmentId === id ? { ...sec, modelUrl: "", attachmentId: undefined } : sec
            );
            if (JSON.stringify(updatedSections) !== JSON.stringify(model3DSections)) {
                save3DSections(updatedSections);
            }

            toast.success("Attachment deleted");
        } catch {
            toast.error("Failed to delete attachment");
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        if (e.clipboardData.files && e.clipboardData.files.length > 0) {
            e.preventDefault();
            Array.from(e.clipboardData.files).forEach(handleFileUpload);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(handleFileUpload);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const saveTitle = async () => {
        if (!cardTitle.trim() || cardTitle.trim() === card.title) {
            setIsEditingTitle(false);
            return;
        }
        try {
            await api.patch(cardBase, { title: cardTitle.trim() });
            setIsEditingTitle(false);
            toast.success("Card title saved");
        } catch {
            toast.error("Failed to update card title");
        }
    };

    const handleDeleteCard = async () => {
        if (!confirm("Are you sure you want to delete this card?")) return;
        try {
            await api.delete(cardBase);
            toast.success("Card deleted");
            handleClose();
        } catch {
            toast.error("Failed to delete card");
        }
    };

    const saveDesc = async () => { try { await api.patch(cardBase, { description: desc }); setEditingDesc(false); toast.success("Description updated"); } catch { toast.error("Failed"); } };
    const savePriority = async (p: string) => { setPriority(p); try { await api.patch(cardBase, { priority: p || null }); } catch { toast.error("Failed"); } };
    const saveDueDate = async (d: string) => { setDueDate(d); try { await api.patch(cardBase, { dueDate: d ? new Date(d).toISOString() : null }); } catch { toast.error("Failed"); } };
    
    // Comment functions
    const addComment = async (e: React.FormEvent) => { e.preventDefault(); if (!newComment.trim()) return; try { const { data } = await api.post(`${cardBase}/comments`, { content: newComment.trim() }); setComments([data, ...comments]); setNewComment(""); } catch { toast.error("Failed"); } };
    const deleteComment = async (id: string) => { try { await api.delete(`${cardBase}/comments/${id}`); setComments(comments.filter(c => c.id !== id)); } catch { toast.error("Failed"); } };
    const saveCommentEdit = async (commentId: string) => {
        if (!editingCommentText.trim()) return;
        try {
            await api.patch(`${cardBase}/comments/${commentId}`, { content: editingCommentText.trim() });
            setComments(comments.map(c => c.id === commentId ? { ...c, content: editingCommentText.trim() } : c));
            setEditingCommentId(null);
            toast.success("Comment updated");
        } catch {
            toast.error("Failed to update comment");
        }
    };

    // Label functions
    const createOrSaveLabel = async () => {
        if (!newLabelName.trim()) return;
        try {
            if (editingLabelId) {
                await api.patch(`${base}/labels/${editingLabelId}`, { name: newLabelName.trim(), color: newLabelColor });
                setBoardLabels(boardLabels.map(l => l.id === editingLabelId ? { ...l, name: newLabelName.trim(), color: newLabelColor } : l));
                setLabels(labels.map(l => l.labelId === editingLabelId ? { ...l, label: { ...l.label, name: newLabelName.trim(), color: newLabelColor } } : l));
                setEditingLabelId(null);
                setNewLabelName("");
                toast.success("Label updated");
            } else {
                const { data: label } = await api.post(`${base}/labels`, { name: newLabelName.trim(), color: newLabelColor });
                const { data: assignment } = await api.post(`${cardBase}/labels`, { labelId: label.id });
                setLabels([...labels, { ...assignment, label }]);
                setBoardLabels([...boardLabels, label]);
                setNewLabelName("");
                toast.success("Label created");
            }
        } catch {
            toast.error("Failed");
        }
    };

    const deleteLabelFromBoard = async (labelId: string) => {
        if (!confirm("Are you sure you want to delete this label from the board?")) return;
        try {
            await api.delete(`${base}/labels/${labelId}`);
            setBoardLabels(boardLabels.filter(l => l.id !== labelId));
            setLabels(labels.filter(l => l.labelId !== labelId));
            if (editingLabelId === labelId) {
                setEditingLabelId(null);
                setNewLabelName("");
            }
            toast.success("Label deleted");
        } catch {
            toast.error("Failed to delete label");
        }
    };

    const toggleLabel = async (label: any) => {
        const assigned = labels.some(l => l.labelId === label.id);
        try {
            if (assigned) {
                await api.delete(`${cardBase}/labels/${label.id}`);
                setLabels(labels.filter(l => l.labelId !== label.id));
            } else {
                const { data } = await api.post(`${cardBase}/labels`, { labelId: label.id });
                setLabels([...labels, { ...data, label }]);
            }
        } catch {
            toast.error("Failed");
        }
    };

    // Checklist functions
    const addChecklist = async () => { if (!newChecklistTitle.trim()) return; try { const { data } = await api.post(`${cardBase}/checklists`, { title: newChecklistTitle.trim() }); setChecklists([...checklists, data]); setNewChecklistTitle(""); setShowAddChecklist(false); } catch { toast.error("Failed"); } };
    const deleteChecklist = async (id: string) => { try { await api.delete(`${cardBase}/checklists/${id}`); setChecklists(checklists.filter(c => c.id !== id)); } catch { toast.error("Failed"); } };
    const renameChecklist = async (clId: string, title: string) => {
        try {
            await api.patch(`${cardBase}/checklists/${clId}`, { title });
            setChecklists(checklists.map(cl => cl.id === clId ? { ...cl, title } : cl));
            toast.success("Checklist renamed");
        } catch {
            toast.error("Failed to rename checklist");
        }
    };

    // Checklist item functions
    const addChecklistItem = async (clId: string, content: string) => { try { const { data } = await api.post(`${cardBase}/checklists/${clId}/items`, { content }); setChecklists(checklists.map(cl => cl.id === clId ? { ...cl, items: [...cl.items, data] } : cl)); } catch { toast.error("Failed"); } };
    const toggleChecklistItem = async (clId: string, itemId: string, isChecked: boolean) => { try { await api.patch(`${cardBase}/checklists/${clId}/items/${itemId}`, { isChecked: !isChecked }); setChecklists(checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.map((it: any) => it.id === itemId ? { ...it, isChecked: !isChecked } : it) } : cl)); } catch { toast.error("Failed"); } };
    const editChecklistItem = async (clId: string, itemId: string, content: string) => {
        try {
            await api.patch(`${cardBase}/checklists/${clId}/items/${itemId}`, { content });
            setChecklists(checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.map((it: any) => it.id === itemId ? { ...it, content } : it) } : cl));
            toast.success("Item updated");
        } catch {
            toast.error("Failed to update item");
        }
    };
    const deleteChecklistItem = async (clId: string, itemId: string) => { try { await api.delete(`${cardBase}/checklists/${clId}/items/${itemId}`); setChecklists(checklists.map(cl => cl.id === clId ? { ...cl, items: cl.items.filter((it: any) => it.id !== itemId) } : cl)); } catch { toast.error("Failed"); } };
    
    const progress = (cl: any) => cl.items?.length ? Math.round((cl.items.filter((i: any) => i.isChecked).length / cl.items.length) * 100) : 0;

    const renderRightPanel = (className: string) => (
                    <div className={`card-modal-right ${className}`} style={{ width: className.includes('mobile-only') ? "100%" : 235, padding: className.includes('mobile-only') ? "20px 0" : "28px 24px", flexShrink: 0, display: className.includes('mobile-only') ? "none" : "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>
                        <div>
                            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, color: "var(--text-muted)" }}>Properties</p>
                            
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                {/* Priority */}
                                <div>
                                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}>Priority</label>
                                    <select value={priority} onChange={(e) => savePriority(e.target.value)} style={{ fontSize: 12.5, padding: "8px 12px" }}>
                                        <option value="">None</option>
                                        {["LOW", "MEDIUM", "HIGH", "URGENT"].map(p => <option key={p} value={p}>{p.toLowerCase()}</option>)}
                                    </select>
                                </div>

                                {/* Due date */}
                                <div>
                                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 6 }}><Calendar size={11} /> Due Date</label>
                                    <input type="date" value={dueDate} onChange={(e) => saveDueDate(e.target.value)} style={{ fontSize: 12.5, padding: "8px 12px" }} />
                                </div>
                            </div>
                        </div>

                        <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

                        <div>
                            <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 12, color: "var(--text-muted)" }}>Manage Card</p>

                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {/* 3D Model Viewer Accordion */}
                                {SHOW_3D_VIEWER && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        <button onClick={() => { setShow3DSectionForm(!show3DSectionForm); setShowLabelPicker(false); setShowMemberPicker(false); setShowAddChecklist(false); }}
                                                style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius)", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", background: show3DSectionForm ? "var(--bg-hover)" : "var(--bg-elevated)", border: show3DSectionForm ? "1px solid var(--border-active)" : "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)", transition: "all 150ms" }}
                                                onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                                                onMouseOut={(e) => e.currentTarget.style.borderColor = show3DSectionForm ? "var(--border-active)" : "var(--border)"}>
                                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                                <Box size={13} style={{ color: "var(--accent)" }} /> 3D Model Viewer
                                                {model3DSections.length > 0 && (
                                                    <span style={{ background: "var(--accent)", color: "white", padding: "2px 6px", borderRadius: 10, fontSize: 10, fontWeight: 800 }}>{model3DSections.length}</span>
                                                )}
                                            </div>
                                            {show3DSectionForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>
                                        {show3DSectionForm && (
                                            <form onSubmit={handleCreate3DSection} style={{ borderRadius: "var(--radius)", padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-active)", display: "flex", flexDirection: "column", gap: 10 }}>
                                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>Asset Section Name</label>
                                                <input
                                                    type="text"
                                                    value={new3DSectionName}
                                                    onChange={(e) => setNew3DSectionName(e.target.value)}
                                                    placeholder="e.g. Hero Model v1"
                                                    style={{ fontSize: 12, padding: "7px 10px" }}
                                                    autoFocus
                                                />
                                                <button type="submit" className="btn-primary" style={{ width: "100%", fontSize: 11.5, padding: "7px 0" }}>
                                                    + Add 3D Section
                                                </button>
                                            </form>
                                        )}
                                    </div>
                                )}
                                {/* Labels Accordion */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <button onClick={() => { setShowLabelPicker(!showLabelPicker); setShowMemberPicker(false); setShowAddChecklist(false); }}
                                            style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius)", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", background: showLabelPicker ? "var(--bg-hover)" : "var(--bg-elevated)", border: showLabelPicker ? "1px solid var(--border-active)" : "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)", transition: "all 150ms" }}
                                            onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                                            onMouseOut={(e) => e.currentTarget.style.borderColor = showLabelPicker ? "var(--border-active)" : "var(--border)"}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Tag size={13} /> Labels
                                            {labels.length > 0 && (
                                                <span style={{ background: "var(--accent)", color: "white", padding: "2px 6px", borderRadius: 10, fontSize: 10, fontWeight: 800 }}>{labels.length}</span>
                                            )}
                                        </div>
                                        {showLabelPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                    {showLabelPicker && (
                                        <div style={{ borderRadius: "var(--radius)", padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-active)", display: "flex", flexDirection: "column", gap: 8 }}>
                                            {boardLabels.map((label: any) => (
                                                <div key={label.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                                                    <button onClick={() => toggleLabel(label)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", borderRadius: 6, fontSize: 12, background: "none", border: "none", cursor: "pointer", color: label.color, textAlign: "left", width: "70%", overflow: "hidden" }}>
                                                        <div style={{ width: 14, height: 14, borderRadius: 3.5, display: "flex", alignItems: "center", justifyContent: "center", background: label.color + "25", border: `1.5px solid ${label.color}`, flexShrink: 0 }}>
                                                            {labels.some(l => l.labelId === label.id) && <Check size={8} style={{ color: label.color }} />}
                                                        </div>
                                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label.name}</span>
                                                    </button>
                                                    <div style={{ display: "flex", gap: 2 }}>
                                                        <button onClick={() => { setEditingLabelId(label.id); setNewLabelName(label.name); setNewLabelColor(label.color); }} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex" }} title="Edit label"><Edit2 size={10} /></button>
                                                        <button onClick={() => deleteLabelFromBoard(label.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--danger)", padding: 2, display: "flex" }} title="Delete label"><Trash2 size={10} /></button>
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ paddingTop: 8, borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
                                                <input type="text" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} placeholder={editingLabelId ? "Update label..." : "New label name"} style={{ fontSize: 11.5, padding: "6px 10px" }} />
                                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                                    {LABEL_PRESETS.map(c => (
                                                        <button key={c} onClick={() => setNewLabelColor(c)} style={{ width: 18, height: 18, borderRadius: "50%", background: c, border: newLabelColor === c ? "1.5px solid white" : "1.5px solid transparent", cursor: "pointer", transition: "transform 150ms", transform: newLabelColor === c ? "scale(1.15)" : "scale(1)" }} />
                                                    ))}
                                                </div>
                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <button onClick={createOrSaveLabel} className="btn-primary" style={{ flex: 1, fontSize: 11, padding: "5px 0" }}>{editingLabelId ? "Save" : "Create"}</button>
                                                    {editingLabelId && <button onClick={() => { setEditingLabelId(null); setNewLabelName(""); }} className="btn-ghost" style={{ fontSize: 11, padding: "5px 8px" }}>Cancel</button>}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Checklist Accordion */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <button onClick={() => { setShowAddChecklist(!showAddChecklist); setShowLabelPicker(false); setShowMemberPicker(false); }}
                                            style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius)", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", background: showAddChecklist ? "var(--bg-hover)" : "var(--bg-elevated)", border: showAddChecklist ? "1px solid var(--border-active)" : "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)", transition: "all 150ms" }}
                                            onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                                            onMouseOut={(e) => e.currentTarget.style.borderColor = showAddChecklist ? "var(--border-active)" : "var(--border)"}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <CheckSquare size={13} /> Checklist
                                            {checklists.length > 0 && (
                                                <span style={{ background: "var(--accent)", color: "white", padding: "2px 6px", borderRadius: 10, fontSize: 10, fontWeight: 800 }}>{checklists.length}</span>
                                            )}
                                        </div>
                                        {showAddChecklist ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                    {showAddChecklist && (
                                        <div style={{ borderRadius: "var(--radius)", padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-active)", display: "flex", flexDirection: "column", gap: 8 }}>
                                            <input type="text" value={newChecklistTitle} onChange={(e) => setNewChecklistTitle(e.target.value)} placeholder="Checklist title" style={{ fontSize: 11.5, padding: "6px 10px" }} autoFocus />
                                            <button onClick={addChecklist} className="btn-primary" style={{ width: "100%", fontSize: 11, padding: "6px 0" }}>Add Checklist</button>
                                        </div>
                                    )}
                                </div>

                                {/* Assignee Accordion */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <button onClick={() => { setShowMemberPicker(!showMemberPicker); setShowLabelPicker(false); setShowAddChecklist(false); setShowAttachmentPicker(false); }}
                                            style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius)", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", background: showMemberPicker ? "var(--bg-hover)" : "var(--bg-elevated)", border: showMemberPicker ? "1px solid var(--border-active)" : "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)", transition: "all 150ms" }}
                                            onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                                            onMouseOut={(e) => e.currentTarget.style.borderColor = showMemberPicker ? "var(--border-active)" : "var(--border)"}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Users size={13} /> Assignees
                                            {members.length > 0 && (
                                                <span style={{ background: "var(--accent)", color: "white", padding: "2px 6px", borderRadius: 10, fontSize: 10, fontWeight: 800 }}>{members.length}</span>
                                            )}
                                        </div>
                                        {showMemberPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                    {showMemberPicker && (
                                        <div style={{ borderRadius: "var(--radius)", padding: 10, background: "var(--bg-elevated)", border: "1px solid var(--border-active)", display: "flex", flexDirection: "column", gap: 4, maxHeight: 180, overflowY: "auto" }}>
                                            {workspaceMembers.map((wm: any) => {
                                                const isAssigned = members.some(m => m.userId === wm.userId);
                                                return (
                                                    <button key={wm.userId}
                                                            onClick={async () => { try { if (isAssigned) { await api.delete(`${cardBase}/members/${wm.userId}`); setMembers(members.filter(m => m.userId !== wm.userId)); } else { const { data } = await api.post(`${cardBase}/members`, { userId: wm.userId }); setMembers([...members, data]); } } catch { toast.error("Failed"); } }}
                                                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", transition: "background 150ms" }}
                                                            onMouseOver={(e) => e.currentTarget.style.background = "var(--bg-hover)"}
                                                            onMouseOut={(e) => e.currentTarget.style.background = "transparent"}>
                                                        <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, flexShrink: 0, background: isAssigned ? "var(--accent)" : "var(--bg-card)", color: "white" }}>
                                                            {isAssigned ? <Check size={10} /> : wm.user.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wm.user.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Attachment Accordion */}
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                    <button onClick={() => { setShowAttachmentPicker(!showAttachmentPicker); setShowLabelPicker(false); setShowAddChecklist(false); setShowMemberPicker(false); }}
                                            style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "var(--radius)", fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "space-between", background: showAttachmentPicker ? "var(--bg-hover)" : "var(--bg-elevated)", border: showAttachmentPicker ? "1px solid var(--border-active)" : "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)", transition: "all 150ms" }}
                                            onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                                            onMouseOut={(e) => e.currentTarget.style.borderColor = showAttachmentPicker ? "var(--border-active)" : "var(--border)"}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                            <Paperclip size={13} /> Attachments
                                            {attachments.length > 0 && (
                                                <span style={{ background: "var(--accent)", color: "white", padding: "2px 6px", borderRadius: 10, fontSize: 10, fontWeight: 800 }}>{attachments.length}</span>
                                            )}
                                        </div>
                                        {showAttachmentPicker ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                    {showAttachmentPicker && (
                                        <div style={{ borderRadius: "var(--radius)", padding: 12, background: "var(--bg-elevated)", border: "1px solid var(--border-active)", display: "flex", flexDirection: "column", gap: 8 }}>
                                            <label style={{ width: "100%" }}>
                                                <input type="file" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} style={{ display: "none" }} />
                                                <div className="btn-primary" style={{ width: "100%", fontSize: 11, padding: "8px 0", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}>
                                                    <UploadCloud size={14} /> Upload Computer File
                                                </div>
                                            </label>
                                            <p style={{ fontSize: 10.5, color: "var(--text-muted)", margin: 0, textAlign: "center" }}>
                                                Or drag & drop / paste directly into card modal
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {members.length > 0 && (
                            <div>
                                <label style={{ display: "block", fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Assignees</label>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {members.map((m: any) => (
                                        <div key={m.userId}
                                             style={{
                                                 width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center",
                                                 justifyContent: "center", fontSize: 10, fontWeight: 800, background: "var(--accent)",
                                                 color: "white", boxShadow: "0 0 0 2px var(--bg-surface)", flexShrink: 0
                                             }}
                                             title={m.user?.name}
                                        >
                                            {(m.user?.name || "U").charAt(0).toUpperCase()}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "4px 0" }} />

                        {/* Delete Card */}
                        <button onClick={handleDeleteCard}
                                style={{
                                    width: "100%", justifyContent: "center", padding: "10px 12px", borderRadius: "var(--radius)",
                                    fontSize: 12.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
                                    background: "none", border: "1px solid rgba(239, 68, 68, 0.2)", cursor: "pointer", color: "var(--danger)",
                                    transition: "all 200ms var(--ease)"
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)"; e.currentTarget.style.borderColor = "var(--danger)"; }}
                                onMouseOut={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = "rgba(239, 68, 68, 0.2)"; }}
                        >
                            <Trash2 size={13} /> Delete Card
                        </button>
                    </div>
                    );

    return (
        <div className="overlay">
            {/* Backdrop closes drawer */}
            <div className="overlay-backdrop" onClick={handleClose} />

            {/* Modal Sheet Container */}
            <div className={`drawer-sheet ${isDraggingOver ? 'dragging-over' : ''}`}
                 onPaste={handlePaste}
                 onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                 onDragLeave={() => setIsDraggingOver(false)}
                 onDrop={handleDrop}
                 style={{
                     position: 'relative',
                     width: '100%',
                     maxWidth: '820px',
                     maxHeight: 'calc(100vh - 48px)',
                     height: '90vh',
                     display: 'flex',
                     flexDirection: 'column',
                     borderRadius: 'var(--radius-lg)',
                     overflow: 'hidden'
                 }}
            >
                {isDraggingOver && (
                    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(95, 98, 241, 0.15)', backdropFilter: 'blur(2px)', border: '2px dashed var(--accent)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
                        <UploadCloud size={48} style={{ color: 'var(--accent)' }} />
                        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>Drop files here to upload to Cloudflare R2</span>
                    </div>
                )}
                {/* Header */}
                <div className="card-modal-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 28px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditingTitle ? (
                            <input
                                type="text"
                                value={cardTitle}
                                onChange={(e) => setCardTitle(e.target.value)}
                                onBlur={saveTitle}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') { setCardTitle(card.title); setIsEditingTitle(false); } }}
                                style={{ fontSize: 16, fontWeight: 800, width: "90%", padding: "4px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-active)", background: "var(--bg-elevated)" }}
                                autoFocus
                            />
                        ) : (
                            <h2 onClick={() => setIsEditingTitle(true)} style={{ fontSize: 16.5, fontWeight: 800, cursor: "pointer", margin: 0, letterSpacing: "-0.01em", color: "var(--text-primary)" }} title="Click to edit card title">
                                {cardTitle}
                            </h2>
                        )}
                        {labels.length > 0 && (
                            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                                {labels.map((cl: any) => (
                                    <span key={cl.labelId || cl.label?.id}
                                          style={{
                                              fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.02em",
                                              textTransform: "uppercase", background: (cl.label?.color || "#636b7d") + "15", color: cl.label?.color || "#636b7d",
                                              border: `1.5px solid ${cl.label?.color}25`
                                          }}>
                                        {cl.label?.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <button onClick={handleClose}
                            style={{
                                width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                                background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", transition: "all 150ms"
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                            onMouseOut={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "none"; }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* 2-Column Content */}
                <div className="card-modal-content" style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
                    {/* Left Column: Description, Checklists, Comments (62%) */}
                    <div className="card-modal-left" style={{ flex: 1, padding: "28px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 28, borderRight: "1px solid var(--border)" }}>
                        {/* Description */}
                        <div>
                            <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10, color: "var(--text-muted)" }}>Description</h3>
                            {editingDesc ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} style={{ fontSize: 13, background: "var(--bg-elevated)" }} placeholder="Add a detailed description..." autoFocus />
                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button onClick={saveDesc} className="btn-primary" style={{ fontSize: 12, padding: "6px 14px" }}>Save</button>
                                        <button onClick={() => { setEditingDesc(false); setDesc(card.description || ""); }} className="btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div onClick={() => setEditingDesc(true)}
                                    style={{
                                        fontSize: 13, padding: 16, borderRadius: "var(--radius)", cursor: "pointer", minHeight: 70,
                                        background: "var(--bg-elevated)", border: "1px solid var(--border)", color: desc ? "var(--text-primary)" : "var(--text-muted)",
                                        lineHeight: 1.6, transition: "border-color 150ms"
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                                    onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                                >
                                    {desc || "Click to add detailed description..."}
                                </div>
                            )}
                        </div>

                        {/* Attachments Section */}
                        <div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                                <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
                                    <Paperclip size={13} /> Attachments ({attachments.length})
                                </h3>
                                {isUploading ? (
                                    <button type="button" onClick={cancelUpload} className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px", display: "flex", alignItems: "center", gap: 5, color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.4)", background: "rgba(239, 68, 68, 0.12)", cursor: "pointer" }}>
                                        <X size={12} /> Cancel Upload
                                    </button>
                                ) : (
                                    <label style={{ cursor: "pointer" }}>
                                        <input type="file" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} style={{ display: "none" }} />
                                        <span className="btn-secondary" style={{ fontSize: 11, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }}>
                                            <Plus size={11} /> Add File
                                        </span>
                                    </label>
                                )}
                            </div>

                            {/* Drag & Drop Target Area */}
                            <div
                                style={{
                                    border: "2px dashed var(--border)",
                                    borderRadius: "var(--radius)",
                                    padding: "16px 20px",
                                    textAlign: "center",
                                    background: "var(--bg-elevated)",
                                    cursor: "pointer",
                                    transition: "all 150ms",
                                    marginBottom: 16
                                }}
                                onMouseOver={(e) => e.currentTarget.style.borderColor = "var(--border-active)"}
                                onMouseOut={(e) => e.currentTarget.style.borderColor = "var(--border)"}
                            >
                                <label style={{ cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <input type="file" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} style={{ display: "none" }} />
                                    <UploadCloud size={22} style={{ color: "var(--text-muted)" }} />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)" }}>
                                        Drag & drop files here, paste from clipboard (<kbd style={{ background: 'var(--bg-card)', padding: '2px 4px', borderRadius: 4 }}>Ctrl+V</kbd>), or <span style={{ color: "var(--accent)" }}>browse</span>
                                    </span>
                                </label>
                            </div>

                            {/* Attachments List */}
                            {attachments.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 280, overflowY: "auto", paddingRight: 6 }}>
                                    {attachments.map((att: any) => {
                                        const isImage = att.mimeType?.startsWith("image/");
                                        const isVideo = att.mimeType?.startsWith("video/");
                                        const is3D = att.fileName.toLowerCase().endsWith('.glb') || att.fileName.toLowerCase().endsWith('.gltf');

                                        return (
                                            <div key={att.id}
                                                 draggable={is3D}
                                                 onDragStart={is3D ? (e) => {
                                                     const payload = JSON.stringify({ is3DAttachment: true, id: att.id, fileName: att.fileName, fileUrl: att.fileUrl, fileSize: att.fileSize });
                                                     e.dataTransfer.setData("text/plain", payload);
                                                     e.dataTransfer.setData("application/x-3d-attachment", payload);
                                                     e.dataTransfer.effectAllowed = "copy";
                                                 } : undefined}
                                                 style={{ borderRadius: "var(--radius)", padding: 12, background: "var(--bg-elevated)", border: is3D ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10, cursor: is3D ? "grab" : "default" }}>
                                                {/* Media Preview */}
                                                {isImage && (
                                                    <div onClick={() => setLightboxMedia({ type: 'image', url: att.fileUrl, title: att.fileName })}
                                                         style={{ borderRadius: "var(--radius-sm)", overflow: "hidden", maxHeight: 240, background: "var(--bg-card)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                                                         title="Click to preview fullscreen">
                                                        <img src={att.fileUrl} alt={att.fileName} style={{ maxWidth: "100%", maxHeight: 240, objectFit: "contain" }} />
                                                    </div>
                                                )}
                                                {isVideo && (
                                                    <div style={{ borderRadius: "var(--radius-sm)", overflow: "hidden", background: "black" }}>
                                                        <video controls src={att.fileUrl} style={{ width: "100%", maxHeight: 280 }} />
                                                    </div>
                                                )}

                                                {/* File Details & Download Row */}
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                                                        <div style={{ width: 32, height: 32, borderRadius: 8, background: is3D ? "rgba(99, 102, 241, 0.15)" : "var(--accent)15", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                                            {is3D ? <Box size={16} /> : isImage ? <ImageIcon size={16} /> : isVideo ? <Video size={16} /> : <FileText size={16} />}
                                                        </div>
                                                        <div style={{ overflow: "hidden" }}>
                                                            <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                                                                {att.fileName}
                                                                {is3D && <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: "rgba(99, 102, 241, 0.15)", color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>3D Model</span>}
                                                            </div>
                                                            <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                                                                {formatFileSize(att.fileSize)} • {new Date(att.createdAt).toLocaleDateString()}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                        {is3D && (
                                                            <button onClick={() => setLightboxMedia({ type: '3d', url: att.fileUrl, title: att.fileName })} className="btn-secondary" style={{ fontSize: 11, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5, background: "rgba(99, 102, 241, 0.15)", color: "var(--accent)", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
                                                                <Eye size={12} /> 3D Preview
                                                            </button>
                                                        )}
                                                        <button onClick={() => forceDownload(att.fileUrl, att.fileName)} className="btn-secondary" style={{ fontSize: 11, padding: "5px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                                                            <Download size={12} /> Download
                                                        </button>
                                                        <button onClick={() => handleDeleteAttachment(att.id)} style={{ width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }} title="Delete attachment" onMouseOver={(e) => e.currentTarget.style.color = "var(--danger)"} onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}>
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                                {is3D && (
                                                    <div style={{ fontSize: 10, color: "var(--text-muted)", fontStyle: "italic", display: "flex", alignItems: "center", gap: 4, paddingTop: 2 }}>
                                                        <Box size={10} style={{ color: "var(--accent)" }} /> Drag this into a 3D Viewer section below to preview
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 3D Model Sections (placed below Attachments) */}
                        {SHOW_3D_VIEWER && model3DSections.map((sec) => (
                            <div key={sec.id} style={{ borderRadius: "var(--radius-lg)", padding: 18, background: "var(--bg-elevated)", border: "1px solid var(--border-hover)", display: "flex", flexDirection: "column", gap: 14 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <h3 style={{ fontSize: 13, fontWeight: 800, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                                        <Box size={15} style={{ color: "var(--accent)" }} /> 3D Model: {sec.title}
                                    </h3>
                                    <button onClick={() => handleDelete3DSection(sec.id)}
                                            style={{ width: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", transition: "color 150ms" }}
                                            onMouseOver={(e) => e.currentTarget.style.color = "var(--danger)"}
                                            onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                                            title="Delete 3D section">
                                        <Trash2 size={13} />
                                    </button>
                                </div>

                                {/* Three3DViewer (React Three Fiber / Three.js WebGL Engine) */}
                                <Three3DViewer
                                    initialModelUrl={sec.modelUrl}
                                    title={sec.title}
                                    availableAttachments={attachments
                                        .filter((att: any) => att.fileName.toLowerCase().endsWith('.glb') || att.fileName.toLowerCase().endsWith('.gltf'))
                                        .map((att: any) => ({ id: att.id, fileName: att.fileName, fileUrl: att.fileUrl, fileSize: att.fileSize }))
                                    }
                                    onAttachmentSelect={(att) => {
                                        handleUpdate3DSectionModel(sec.id, att.fileUrl, att.id);
                                    }}
                                    onModelChange={(url, fileInfo) => {
                                        const attId = (fileInfo as any)?.attachmentId;
                                        handleUpdate3DSectionModel(sec.id, url, attId);
                                    }}
                                    onFileUpload={async (file) => {
                                        const result = await handleFileUpload(file);
                                        return result ? { fileUrl: result.fileUrl, attachmentId: result.id } : null;
                                    }}
                                />
                            </div>
                        ))}

                        {/* Checklists */}
                        {checklists.length > 0 && (
                            <div>
                                <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}><CheckSquare size={12} /> Checklists</h3>
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    {checklists.map((cl) => (
                                        <ChecklistSection
                                            key={cl.id}
                                            checklist={cl}
                                            onToggleItem={(itemId, checked) => toggleChecklistItem(cl.id, itemId, checked)}
                                            onAddItem={(content) => addChecklistItem(cl.id, content)}
                                            onEditItem={(itemId, content) => editChecklistItem(cl.id, itemId, content)}
                                            onDeleteItem={(itemId) => deleteChecklistItem(cl.id, itemId)}
                                            onDelete={() => deleteChecklist(cl.id)}
                                            onRename={(title) => renameChecklist(cl.id, title)}
                                            progress={progress(cl)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {renderRightPanel("mobile-only")}

                        {/* Tabs (Comments / Activity) */}
                        <div className="card-modal-comments" style={{ marginTop: "auto" }}>
                            <div style={{ display: "flex", gap: 4, marginBottom: 20, padding: 4, borderRadius: "var(--radius)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                                {(["comments", "activity"] as const).map(tab => (
                                    <button key={tab} onClick={() => setActiveTab(tab)}
                                        style={{
                                            flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: "var(--radius-sm)",
                                            textTransform: "capitalize", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                            background: activeTab === tab ? "var(--bg-card)" : "transparent",
                                            color: activeTab === tab ? "var(--text-primary)" : "var(--text-secondary)",
                                            boxShadow: activeTab === tab ? "var(--shadow-sm)" : "none",
                                            transition: "all 150ms var(--ease)"
                                        }}>
                                        {tab === "comments" ? <><MessageSquare size={13} />Comments ({comments.length})</> : <><Activity size={13} />Activity ({activity.length})</>}
                                    </button>
                                ))}
                            </div>

                            {activeTab === "comments" ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                    <form onSubmit={addComment} style={{ display: "flex", gap: 8 }}>
                                        <input type="text" value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Write a comment..." style={{ fontSize: 13, background: "var(--bg-elevated)" }} />
                                        <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "8px 16px" }}>Send</button>
                                    </form>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        {comments.map((c) => (
                                            <div key={c.id} style={{ padding: "14px 16px", borderRadius: "var(--radius)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                        <div style={{ width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 800, background: "var(--accent)", color: "white" }}>{(c.user?.name || "U").charAt(0).toUpperCase()}</div>
                                                        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{c.user?.name || "User"}</span>
                                                        <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{new Date(c.createdAt).toLocaleDateString()} at {new Date(c.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                    <div style={{ display: "flex", gap: 4 }}>
                                                        <button onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }} style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", transition: "color 150ms" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--text-primary)"} onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"} title="Edit comment">
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                                                        </button>
                                                        <button onClick={() => deleteComment(c.id)} style={{ width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", transition: "color 150ms" }} onMouseOver={(e) => e.currentTarget.style.color = "var(--danger)"} onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"} title="Delete comment"><Trash2 size={12} /></button>
                                                    </div>
                                                </div>
                                                {editingCommentId === c.id ? (
                                                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4, paddingLeft: 34 }}>
                                                        <input type="text" value={editingCommentText} onChange={(e) => setEditingCommentText(e.target.value)} style={{ fontSize: 13 }} autoFocus />
                                                        <div style={{ display: "flex", gap: 8 }}>
                                                            <button onClick={() => saveCommentEdit(c.id)} className="btn-primary" style={{ fontSize: 11, padding: "4px 10px" }}>Save</button>
                                                            <button onClick={() => setEditingCommentId(null)} className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>Cancel</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p style={{ fontSize: 13, paddingLeft: 34, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{c.content}</p>
                                                )}
                                            </div>
                                        ))}
                                        {comments.length === 0 && <p style={{ fontSize: 12.5, textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>No comments yet</p>}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {activity.map((a: any) => (
                                        <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 10px", fontSize: 12.5, color: "var(--text-secondary)" }}>
                                            <Activity size={13} style={{ marginTop: 2, flexShrink: 0, color: "var(--accent)" }} />
                                            <div>
                                                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{a.user?.name}</span> {a.action} {a.details && <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>— {a.details}</span>}
                                                <div style={{ fontSize: 10.5, marginTop: 2, color: "var(--text-muted)" }}>{new Date(a.createdAt).toLocaleString()}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {activity.length === 0 && <p style={{ fontSize: 12.5, textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>No activity yet</p>}
                                </div>
                            )}
                        </div>
                    </div>
                    {renderRightPanel("desktop-only")}
                </div>
            </div>

            {/* Media Preview Lightbox Popup */}
            {lightboxMedia && (
                <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0, 0, 0, 0.88)", backdropFilter: "blur(16px)" }}>
                    <div style={{ position: "absolute", top: 20, right: 24, display: "flex", alignItems: "center", gap: 12, zIndex: 1010 }}>
                        <button onClick={() => forceDownload(lightboxMedia.url, lightboxMedia.title || "media-asset")} className="btn-primary" style={{ padding: "8px 16px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                            <Download size={14} /> Download
                        </button>
                        <button onClick={() => setLightboxMedia(null)} className="btn-ghost" style={{ padding: 8, borderRadius: "50%", background: "rgba(255,255,255,0.15)", color: "white" }}>
                            <X size={20} />
                        </button>
                    </div>

                    <div style={{ maxWidth: "90vw", maxHeight: "88vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                        {lightboxMedia.type === "image" && (
                            <img src={lightboxMedia.url} alt={lightboxMedia.title} style={{ maxWidth: "90vw", maxHeight: "82vh", objectFit: "contain", borderRadius: "var(--radius)", boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }} />
                        )}
                        {lightboxMedia.type === "video" && (
                            <video controls autoPlay src={lightboxMedia.url} style={{ maxWidth: "90vw", maxHeight: "82vh", borderRadius: "var(--radius)", boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }} />
                        )}
                        {lightboxMedia.type === "3d" && (
                            <div style={{ width: "85vw", height: "75vh" }}>
                                <Three3DViewer
                                    initialModelUrl={lightboxMedia.url}
                                    title={lightboxMedia.title}
                                />
                            </div>
                        )}
                        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginTop: 14 }}>{lightboxMedia.title}</div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---- Checklist Section ---- */
function ChecklistSection({ checklist, onToggleItem, onAddItem, onEditItem, onDeleteItem, onDelete, onRename, progress }: {
    checklist: any; onToggleItem: (id: string, checked: boolean) => void; onAddItem: (content: string) => void; onEditItem: (id: string, content: string) => void; onDeleteItem: (id: string) => void; onDelete: () => void; onRename: (title: string) => void; progress: number;
}) {
    const [showAdd, setShowAdd] = useState(false);
    const [itemContent, setItemContent] = useState("");
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(checklist.title);

    const [editingItemId, setEditingItemId] = useState<string | null>(null);
    const [editingItemText, setEditingItemText] = useState("");

    const handleAdd = (e: React.FormEvent) => { e.preventDefault(); if (!itemContent.trim()) return; onAddItem(itemContent.trim()); setItemContent(""); };
    
    const handleSaveTitle = () => {
        if (!editTitle.trim() || editTitle.trim() === checklist.title) {
            setIsEditingTitle(false);
            return;
        }
        onRename(editTitle.trim());
        setIsEditingTitle(false);
    };

    const handleSaveItemEdit = (itemId: string) => {
        if (!editingItemText.trim()) return;
        onEditItem(itemId, editingItemText.trim());
        setEditingItemId(null);
    };

    return (
        <div style={{ borderRadius: "var(--radius)", padding: 18, background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                {isEditingTitle ? (
                    <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={handleSaveTitle}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setEditTitle(checklist.title); setIsEditingTitle(false); } }}
                        style={{ fontSize: 13, fontWeight: 700, padding: "4px 8px", borderRadius: "var(--radius-sm)", width: "180px", background: "var(--bg-surface)", border: "1px solid var(--border-active)" }}
                        autoFocus
                    />
                ) : (
                    <h4 onClick={() => setIsEditingTitle(true)} style={{ fontSize: 13, fontWeight: 800, cursor: "pointer", margin: 0, color: "var(--text-primary)" }} title="Click to rename checklist">
                        {checklist.title}
                    </h4>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: progress === 100 ? "var(--success)" : "var(--accent)" }}>{progress}%</span>
                    <button onClick={onDelete}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", borderRadius: 6, transition: "color 150ms" }}
                            onMouseOver={(e) => e.currentTarget.style.color = "var(--danger)"}
                            onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>

            <div className="progress-track" style={{ marginBottom: 16 }}>
                <div className="progress-fill" style={{ width: `${progress}%`, background: progress === 100 ? "var(--success)" : undefined }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {checklist.items?.map((item: any) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "3px 0" }}>
                        <div className={`custom-checkbox ${item.isChecked ? 'checked' : ''}`}
                             onClick={() => onToggleItem(item.id, item.isChecked)}
                             style={{ flexShrink: 0 }}
                        />
                        {editingItemId === item.id ? (
                            <div style={{ flex: 1, display: "flex", gap: 8 }}>
                                <input
                                    type="text"
                                    value={editingItemText}
                                    onChange={(e) => setEditingItemText(e.target.value)}
                                    style={{ fontSize: 12.5, flex: 1, padding: "4px 8px" }}
                                    autoFocus
                                />
                                <button onClick={() => handleSaveItemEdit(item.id)} className="btn-primary" style={{ fontSize: 11, padding: "4px 10px" }}>Save</button>
                                <button onClick={() => setEditingItemId(null)} className="btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}>Cancel</button>
                            </div>
                        ) : (
                            <>
                                <span onClick={() => { setEditingItemId(item.id); setEditingItemText(item.content); }}
                                    style={{ flex: 1, fontSize: 12.5, textDecoration: item.isChecked ? "line-through" : "none", color: item.isChecked ? "var(--text-muted)" : "var(--text-secondary)", cursor: "pointer", transition: "color 150ms" }}
                                    onMouseOver={(e) => { if (!item.isChecked) e.currentTarget.style.color = "var(--text-primary)"; }}
                                    onMouseOut={(e) => { if (!item.isChecked) e.currentTarget.style.color = "var(--text-secondary)"; }}
                                    title="Click to edit item text"
                                >
                                    {item.content}
                                </span>
                                <button onClick={() => onDeleteItem(item.id)}
                                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", opacity: 0, transition: "opacity 150ms" }}
                                        className="item-delete-btn"
                                >
                                    <X size={12} />
                                </button>
                            </>
                        )}
                    </div>
                ))}
            </div>

            {showAdd ? (
                <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <input type="text" value={itemContent} onChange={(e) => setItemContent(e.target.value)} placeholder="Add checklist item..." style={{ flex: 1, fontSize: 12, padding: "6px 12px" }} autoFocus />
                    <button type="submit" className="btn-primary" style={{ fontSize: 11.5, padding: "6px 14px" }}>Add</button>
                    <button type="button" onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0 6px", display: "flex", alignItems: "center" }}><X size={15} /></button>
                </form>
            ) : (
                <button onClick={() => setShowAdd(true)}
                        style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, marginTop: 14, padding: "4px 0", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", fontWeight: 600, transition: "color 150ms" }}
                        onMouseOver={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                        onMouseOut={(e) => e.currentTarget.style.color = "var(--text-secondary)"}
                >
                    <Plus size={13} /> Add checklist item
                </button>
            )}

            <style>{`
                div:hover .item-delete-btn {
                    opacity: 0.6 !important;
                }
                div:hover .item-delete-btn:hover {
                    opacity: 1 !important;
                    color: var(--danger) !important;
                }
            `}</style>
        </div>
    );
}
