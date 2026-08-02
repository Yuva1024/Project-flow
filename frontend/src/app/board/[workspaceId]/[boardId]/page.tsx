"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useBoardStore, List, Card } from "@/store/board";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { ArrowLeft, Plus, X, Loader2, Calendar, Sun, Moon } from "lucide-react";
import CardModal from "@/components/CardModal";
import NotificationDropdown from "@/components/NotificationDropdown";
import { useTheme } from "@/hooks/useTheme";

/* ---- Card Item ---- */
function CardItem({ card, index, onClick, onDelete }: { card: Card; index: number; onClick: () => void; onDelete: () => void }) {
    const pColors: Record<string, string> = { URGENT: "#ef4444", HIGH: "#f59e0b", MEDIUM: "#6366f1", LOW: "#10b981" };
    return (
        <Draggable draggableId={card.id} index={index}>
            {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={onClick}
                    style={{
                        position: "relative",
                        borderRadius: "var(--radius)", padding: "14px 14px 12px 18px", marginBottom: 10, cursor: "pointer",
                        background: snapshot.isDragging ? "var(--bg-elevated)" : "var(--bg-card)",
                        border: `1px solid ${snapshot.isDragging ? "var(--accent)" : "var(--border)"}`,
                        boxShadow: snapshot.isDragging ? "var(--shadow-lg)" : "var(--shadow-sm)",
                        transition: snapshot.isDragging 
                            ? "background-color 150ms var(--ease), border-color 150ms var(--ease), box-shadow 150ms var(--ease)"
                            : "background-color 150ms var(--ease), border-color 150ms var(--ease), box-shadow 150ms var(--ease), transform 150ms var(--ease)",
                        ...provided.draggableProps.style,
                    }}
                    onMouseOver={(e) => { 
                        if (!snapshot.isDragging) {
                            e.currentTarget.style.borderColor = "var(--border-active)"; 
                            e.currentTarget.style.transform = "translateY(-1.5px) scale(1.006)";
                            e.currentTarget.style.boxShadow = "var(--shadow)";
                        }
                    }}
                    onMouseOut={(e) => { 
                        if (!snapshot.isDragging) {
                            e.currentTarget.style.borderColor = "var(--border)"; 
                            e.currentTarget.style.transform = "none";
                            e.currentTarget.style.boxShadow = "var(--shadow-sm)";
                        }
                    }}
                >
                    {card.priority && (
                        <div style={{
                            position: "absolute",
                            left: 0,
                            top: 14,
                            bottom: 14,
                            width: 3.5,
                            borderRadius: "0 4px 4px 0",
                            background: pColors[card.priority] || "#636b7d",
                            boxShadow: `0 0 6px ${pColors[card.priority] || "#636b7d"}`
                        }} />
                    )}

                    {card.labels && card.labels.length > 0 && (
                        <div style={{ display: "flex", gap: 5, marginBottom: 8, flexWrap: "wrap" }}>
                            {card.labels.map((cl) => (
                                <span key={cl.labelId} style={{ display: "inline-block", height: 5, width: 28, borderRadius: 2.5, background: cl.label.color }} title={cl.label.name} />
                            ))}
                        </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <p style={{ fontSize: 13, fontWeight: 650, lineHeight: 1.45, color: "var(--text-primary)", flex: 1, margin: 0 }}>{card.title}</p>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(); }}
                            style={{
                                background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                                padding: 2, display: "flex", alignItems: "center", justifyContent: "center",
                                opacity: 0, transition: "opacity 150ms"
                            }}
                            className="card-delete-btn"
                            title="Delete card"
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                    </div>
                    {(card.priority || card.dueDate) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                            {card.priority && (
                                <span style={{
                                    fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, letterSpacing: "0.03em",
                                    textTransform: "uppercase", background: (pColors[card.priority] || "#636b7d") + "18", color: pColors[card.priority] || "#636b7d",
                                    border: `1px solid ${(pColors[card.priority] || "#636b7d")}25`
                                }}>
                                    {card.priority.toLowerCase()}
                                </span>
                            )}
                            {card.dueDate && (
                                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: "var(--text-secondary)", fontWeight: 500 }}>
                                    <Calendar size={11} style={{ color: "var(--text-muted)" }} />
                                    {new Date(card.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                </span>
                            )}
                        </div>
                    )}

                    <style>{`
                        div:hover .card-delete-btn {
                            opacity: 0.6 !important;
                        }
                        div:hover .card-delete-btn:hover {
                            opacity: 1 !important;
                            color: var(--danger) !important;
                        }
                    `}</style>
                </div>
            )}
        </Draggable>
    );
}

/* ---- List Column ---- */
function ListColumn({ list, workspaceId, boardId, onCardClick, onRefresh, onDeleteCard }: {
    list: List; workspaceId: string; boardId: string; onCardClick: (card: Card) => void; onRefresh: () => void; onDeleteCard: (cardId: string) => void;
}) {
    const [showAdd, setShowAdd] = useState(false);
    const [title, setTitle] = useState("");
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editTitle, setEditTitle] = useState(list.title);
    const { updateList, deleteList } = useBoardStore();

    const addCard = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        try { 
            await api.post(`/workspaces/${workspaceId}/boards/${boardId}/lists/${list.id}/cards`, { title: title.trim() }); 
            setTitle(""); 
            setShowAdd(false); 
            onRefresh(); 
        } catch { 
            toast.error("Failed to add card"); 
        }
    };

    const handleSaveTitle = async () => {
        if (!editTitle.trim() || editTitle.trim() === list.title) {
            setIsEditingTitle(false);
            return;
        }
        try {
            await updateList(workspaceId, boardId, list.id, editTitle.trim());
            setIsEditingTitle(false);
            toast.success("List renamed");
            onRefresh();
        } catch {
            toast.error("Failed to rename list");
        }
    };

    const handleDelete = async () => {
        if (!confirm(`Are you sure you want to delete "${list.title}"? All cards in it will be permanently deleted.`)) return;
        try {
            await deleteList(workspaceId, boardId, list.id);
            toast.success("List deleted");
            onRefresh();
        } catch {
            toast.error("Failed to delete list");
        }
    };

    const getStatusColor = (listTitle: string) => {
        const t = listTitle.toLowerCase();
        if (t.includes("progress") || t.includes("doing") || t.includes("active")) return "var(--warning)";
        if (t.includes("done") || t.includes("complete") || t.includes("finished")) return "var(--success)";
        if (t.includes("todo") || t.includes("to do") || t.includes("backlog")) return "var(--accent)";
        return "var(--text-muted)";
    };

    const statusColor = getStatusColor(list.title);

    return (
        <div style={{
            flexShrink: 0, width: 285, borderRadius: "var(--radius-lg)", display: "flex", flexDirection: "column",
            maxHeight: "calc(100vh - 120px)", background: "var(--bg-surface)", border: "1px solid var(--border)",
            boxShadow: "var(--shadow)",
        }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, boxShadow: `0 0 8px ${statusColor}`, flexShrink: 0 }} />
                
                <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditingTitle ? (
                        <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={handleSaveTitle}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') { setEditTitle(list.title); setIsEditingTitle(false); } }}
                            style={{ fontSize: 13, fontWeight: 700, padding: "4px 8px", borderRadius: "var(--radius-sm)", width: "100%", background: "var(--bg-elevated)", border: "1px solid var(--border-active)" }}
                            autoFocus
                        />
                    ) : (
                        <h3
                            onClick={() => setIsEditingTitle(true)}
                            style={{ fontSize: 13, fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", margin: 0, color: "var(--text-primary)" }}
                            title="Click to rename"
                        >
                            {list.title}
                        </h3>
                    )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                        {list.cards.length}
                    </span>
                    <button
                        onClick={handleDelete}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", borderRadius: 6, transition: "color 150ms" }}
                        onMouseOver={(e) => e.currentTarget.style.color = "var(--danger)"}
                        onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}
                        title="Delete list"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>

            {/* Cards */}
            <Droppable droppableId={list.id} type="CARD">
                {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                        style={{
                            flex: 1, overflowY: "auto", padding: 12, minHeight: 60,
                            background: snapshot.isDraggingOver ? "var(--accent-soft)" : undefined,
                            transition: "background 200ms var(--ease)"
                        }}>
                        {list.cards.map((card, index) => (
                            <CardItem key={card.id} card={card} index={index} onClick={() => onCardClick(card)} onDelete={() => onDeleteCard(card.id)} />
                        ))}
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>

            {/* Add card */}
            <div style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
                {showAdd ? (
                    <form onSubmit={addCard} style={{ padding: 10, borderRadius: "var(--radius)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card title..." style={{ fontSize: 13, marginBottom: 8, padding: "8px 12px" }} autoFocus />
                        <div style={{ display: "flex", gap: 8 }}>
                            <button type="submit" className="btn-primary" style={{ fontSize: 11.5, padding: "5px 12px" }}>Add Card</button>
                            <button type="button" onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "5px 8px", display: "flex", alignItems: "center" }}><X size={15} /></button>
                        </div>
                    </form>
                ) : (
                    <button onClick={() => setShowAdd(true)}
                        style={{
                            width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: "var(--radius)",
                            fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
                            background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", transition: "all 150ms"
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                    >
                        <Plus size={14} /> Add card
                    </button>
                )}
            </div>
        </div>
    );
}

/* ---- Board Page ---- */
export default function BoardPage() {
    const params = useParams();
    const { theme, toggleTheme } = useTheme();
    const router = useRouter();
    const wId = params.workspaceId as string;
    const bId = params.boardId as string;
    const { token, loadUser, isLoading: authLoading } = useAuthStore();
    const { currentBoard, fetchBoard, reorderCards, reorderLists, updateBoard, deleteBoard, isLoading } = useBoardStore();
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [showAddList, setShowAddList] = useState(false);
    const [listTitle, setListTitle] = useState("");

    const [isEditingBoardName, setIsEditingBoardName] = useState(false);
    const [boardName, setBoardName] = useState("");
    const [showDeleteBoardModal, setShowDeleteBoardModal] = useState(false);

    useEffect(() => { loadUser(); }, []);
    useEffect(() => {
        if (!authLoading && !token) { router.replace("/login"); return; }
        if (token && wId && bId) fetchBoard(wId, bId).catch(() => toast.error("Board not found"));
    }, [token, authLoading, wId, bId]);

    const refresh = () => fetchBoard(wId, bId);

    const onDragEnd = useCallback(async (result: DropResult) => {
        if (!result.destination || !currentBoard) return;
        const { source, destination, draggableId, type } = result;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        if (type === "LIST") {
            const listIds = currentBoard.lists.map(l => l.id);
            const [removed] = listIds.splice(source.index, 1);
            listIds.splice(destination.index, 0, removed);
            await reorderLists(wId, bId, listIds);
        } else {
            await reorderCards(wId, bId, draggableId, destination.droppableId, destination.index);
        }
    }, [currentBoard, wId, bId]);

    const addList = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!listTitle.trim()) return;
        try { 
            await api.post(`/workspaces/${wId}/boards/${bId}/lists`, { title: listTitle.trim() }); 
            setListTitle(""); 
            setShowAddList(false); 
            refresh(); 
        } catch { 
            toast.error("Failed to create list"); 
        }
    };

    const handleSaveBoardName = async () => {
        if (!boardName.trim() || boardName.trim() === currentBoard?.title) {
            setIsEditingBoardName(false);
            return;
        }
        try {
            await updateBoard(wId, bId, { title: boardName.trim() });
            setIsEditingBoardName(false);
            toast.success("Board renamed");
        } catch {
            toast.error("Failed to rename board");
        }
    };

    const handleDeleteBoard = async () => {
        try {
            await deleteBoard(wId, bId);
            toast.success("Board deleted");
            router.replace("/dashboard");
        } catch {
            toast.error("Failed to delete board");
        }
    };

    const handleDeleteCard = async (cardId: string) => {
        if (!confirm("Are you sure you want to delete this card?")) return;
        try {
            await api.delete(`/workspaces/${wId}/boards/${bId}/cards/${cardId}`);
            toast.success("Card deleted");
            refresh();
        } catch {
            toast.error("Failed to delete card");
        }
    };

    if (authLoading || isLoading || !currentBoard) {
        return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg-base)" }}>
                <Loader2 size={28} className="spinner" style={{ color: "var(--accent)" }} />
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "transparent", color: "var(--text-primary)" }}>
            {/* Header */}
            <header style={{ 
                display: "flex", alignItems: "center", gap: 16, padding: "14px 28px", flexShrink: 0, 
                background: "var(--bg-surface)", borderBottom: "1px solid var(--border)",
                backdropFilter: "blur(20px) saturate(140%)"
            }}>
                <button onClick={() => router.push("/dashboard")}
                        style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", transition: "all 150ms var(--ease)" }}
                        onMouseOver={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                        onMouseOut={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "none"; }}
                >
                    <ArrowLeft size={16} />
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 3, height: 16, borderRadius: 1.5, background: "var(--accent)" }} />
                    {isEditingBoardName ? (
                        <input
                            type="text"
                            value={boardName}
                            onChange={(e) => setBoardName(e.target.value)}
                            onBlur={handleSaveBoardName}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveBoardName(); if (e.key === 'Escape') { setBoardName(currentBoard.title); setIsEditingBoardName(false); } }}
                            style={{ fontSize: 15, fontWeight: 800, padding: "4px 8px", borderRadius: "var(--radius-sm)", width: "220px", background: "var(--bg-elevated)", border: "1px solid var(--border-active)" }}
                            autoFocus
                        />
                    ) : (
                        <h1
                            onClick={() => { setIsEditingBoardName(true); setBoardName(currentBoard.title); }}
                            style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-0.02em", cursor: "pointer", margin: 0 }}
                            title="Click to rename board"
                        >
                            {currentBoard.title}
                        </h1>
                    )}
                </div>

                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                    <button onClick={toggleTheme} className="btn-ghost" style={{ padding: 8, display: "flex", alignItems: "center", justifyContent: "center" }} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                    </button>
                    <NotificationDropdown />
                    <button
                        onClick={() => setShowDeleteBoardModal(true)}
                        className="btn-ghost"
                        style={{ color: "var(--danger)", border: "1px solid rgba(239, 68, 68, 0.15)", padding: "7px 14px", fontSize: 12.5 }}
                        onMouseOver={(e) => e.currentTarget.style.background = "rgba(239, 68, 68, 0.06)"}
                        onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                    >
                        Delete Board
                    </button>
                </div>
            </header>

            {/* Board Grid view */}
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="board" type="LIST" direction="horizontal">
                    {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}
                            style={{ flex: 1, display: "flex", gap: 20, padding: 24, overflowX: "auto", alignItems: "flex-start" }}>
                            {currentBoard.lists.map((list, index) => (
                                <Draggable key={list.id} draggableId={list.id} index={index}>
                                    {(providedDrag) => (
                                        <div ref={providedDrag.innerRef} {...providedDrag.draggableProps} {...providedDrag.dragHandleProps}>
                                            <ListColumn
                                                list={list}
                                                workspaceId={wId}
                                                boardId={bId}
                                                onCardClick={setSelectedCard}
                                                onRefresh={refresh}
                                                onDeleteCard={handleDeleteCard}
                                            />
                                        </div>
                                    )}
                                </Draggable>
                            ))}
                            {provided.placeholder}

                            {/* Add List */}
                            <div style={{ flexShrink: 0, width: 285 }}>
                                {showAddList ? (
                                    <form onSubmit={addList} style={{ borderRadius: "var(--radius-lg)", padding: 14, background: "var(--bg-surface)", border: "1px solid var(--border-hover)", boxShadow: "var(--shadow)" }}>
                                        <input type="text" value={listTitle} onChange={(e) => setListTitle(e.target.value)} placeholder="List title..." style={{ fontSize: 13, marginBottom: 10, padding: "8px 12px" }} autoFocus />
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "6px 14px", flex: 1 }}>Add List</button>
                                            <button type="button" onClick={() => setShowAddList(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "6px 10px", display: "flex", alignItems: "center" }}><X size={15} /></button>
                                        </div>
                                    </form>
                                ) : (
                                    <button onClick={() => setShowAddList(true)}
                                        style={{
                                            width: "100%", padding: 16, borderRadius: "var(--radius-lg)", fontSize: 12.5, fontWeight: 700,
                                            display: "flex", alignItems: "center", gap: 8, border: "1.5px dashed var(--border-active)",
                                            background: "transparent", cursor: "pointer", color: "var(--text-secondary)", transition: "all 250ms var(--ease)"
                                        }}
                                        onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--accent-soft)"; }}
                                        onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border-active)"; e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "transparent"; }}
                                    >
                                        <Plus size={15} /> Add another list
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </Droppable>
            </DragDropContext>

            {/* Delete Board Modal */}
            {showDeleteBoardModal && (
                <div className="overlay">
                    <div className="overlay-backdrop" onClick={() => setShowDeleteBoardModal(false)} />
                    <div className="overlay-content" style={{ maxWidth: 420, width: "100%", border: "1px solid var(--border-active)" }}>
                        <div style={{ padding: 24 }}>
                            <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12, color: "var(--danger)", letterSpacing: "-0.01em" }}>Delete Board</h3>
                            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24 }}>
                                Are you sure you want to delete this board? All lists, cards, comment threads, labels, and checklist items inside will be permanently lost.
                            </p>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                                <button onClick={() => setShowDeleteBoardModal(false)} className="btn-ghost" style={{ padding: "8px 14px", fontSize: 12 }}>Cancel</button>
                                <button onClick={handleDeleteBoard} className="btn-primary" style={{ background: "var(--danger)", borderColor: "var(--danger)", padding: "8px 16px", fontSize: 12 }}>Delete</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedCard && <CardModal card={selectedCard} workspaceId={wId} boardId={bId} onClose={() => setSelectedCard(null)} onRefresh={refresh} />}
        </div>
    );
}
