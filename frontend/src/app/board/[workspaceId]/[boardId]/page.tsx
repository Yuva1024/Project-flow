"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { useBoardStore, List, Card } from "@/store/board";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { ArrowLeft, Plus, X, Loader2, Calendar } from "lucide-react";
import CardModal from "@/components/CardModal";

/* ---- Card Item ---- */
function CardItem({ card, index, onClick }: { card: Card; index: number; onClick: () => void }) {
    const pColors: Record<string, string> = { URGENT: "#f87171", HIGH: "#fbbf24", MEDIUM: "#5b9bf5", LOW: "#34d399" };
    return (
        <Draggable draggableId={card.id} index={index}>
            {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={onClick}
                    style={{
                        borderRadius: 10, padding: 12, marginBottom: 8, cursor: "pointer",
                        background: snapshot.isDragging ? "var(--bg-hover)" : "var(--bg-card)",
                        border: `1px solid ${snapshot.isDragging ? "var(--accent)" : "var(--border)"}`,
                        boxShadow: snapshot.isDragging ? "var(--shadow-lg)" : "var(--shadow-sm)",
                        transition: "box-shadow 200ms, background 200ms",
                        ...provided.draggableProps.style,
                    }}>
                    {card.labels && card.labels.length > 0 && (
                        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                            {card.labels.map((cl) => (
                                <span key={cl.labelId} style={{ display: "inline-block", height: 6, width: 32, borderRadius: 3, background: cl.label.color }} title={cl.label.name} />
                            ))}
                        </div>
                    )}
                    <p style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, marginBottom: 4 }}>{card.title}</p>
                    {(card.priority || card.dueDate) && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                            {card.priority && (
                                <span className="badge" style={{ fontSize: 10, padding: "2px 8px", background: (pColors[card.priority] || "#636b7d") + "18", color: pColors[card.priority] || "#636b7d" }}>
                                    {card.priority}
                                </span>
                            )}
                            {card.dueDate && (
                                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
                                    <Calendar size={10} />
                                    {new Date(card.dueDate).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Draggable>
    );
}

/* ---- List Column ---- */
function ListColumn({ list, workspaceId, boardId, onCardClick, onRefresh }: {
    list: List; workspaceId: string; boardId: string; onCardClick: (card: Card) => void; onRefresh: () => void;
}) {
    const [showAdd, setShowAdd] = useState(false);
    const [title, setTitle] = useState("");
    const addCard = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        try { await api.post(`/workspaces/${workspaceId}/boards/${boardId}/lists/${list.id}/cards`, { title: title.trim() }); setTitle(""); setShowAdd(false); onRefresh(); }
        catch { toast.error("Failed to add card"); }
    };

    return (
        <div style={{
            flexShrink: 0, width: 280, borderRadius: 12, display: "flex", flexDirection: "column",
            maxHeight: "calc(100vh - 72px)",
            background: "var(--bg-surface)", border: "1px solid var(--border-hover)",
        }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{list.title}</h3>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "var(--bg-card)", color: "var(--text-muted)" }}>{list.cards.length}</span>
            </div>

            {/* Cards */}
            <Droppable droppableId={list.id} type="CARD">
                {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}
                        style={{ flex: 1, overflowY: "auto", padding: 8, minHeight: 60, background: snapshot.isDraggingOver ? "var(--accent-glow)" : undefined, transition: "background 200ms" }}>
                        {list.cards.map((card, index) => (
                            <CardItem key={card.id} card={card} index={index} onClick={() => onCardClick(card)} />
                        ))}
                        {provided.placeholder}
                    </div>
                )}
            </Droppable>

            {/* Add card */}
            <div style={{ padding: 8, borderTop: "1px solid var(--border)" }}>
                {showAdd ? (
                    <form onSubmit={addCard} style={{ padding: 8, borderRadius: 8, background: "var(--bg-elevated)" }}>
                        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Card title..." style={{ fontSize: 13, marginBottom: 8 }} autoFocus />
                        <div style={{ display: "flex", gap: 8 }}>
                            <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "6px 14px" }}>Add Card</button>
                            <button type="button" onClick={() => setShowAdd(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "6px 10px" }}><X size={14} /></button>
                        </div>
                    </form>
                ) : (
                    <button onClick={() => setShowAdd(true)}
                        style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                        <Plus size={14} /> Add a card
                    </button>
                )}
            </div>
        </div>
    );
}

/* ---- Board Page ---- */
export default function BoardPage() {
    const params = useParams();
    const router = useRouter();
    const wId = params.workspaceId as string;
    const bId = params.boardId as string;
    const { token, loadUser, isLoading: authLoading } = useAuthStore();
    const { currentBoard, fetchBoard, reorderCards, isLoading } = useBoardStore();
    const [selectedCard, setSelectedCard] = useState<Card | null>(null);
    const [showAddList, setShowAddList] = useState(false);
    const [listTitle, setListTitle] = useState("");

    useEffect(() => { loadUser(); }, []);
    useEffect(() => {
        if (!authLoading && !token) { router.replace("/login"); return; }
        if (token && wId && bId) fetchBoard(wId, bId).catch(() => toast.error("Board not found"));
    }, [token, authLoading, wId, bId]);

    const refresh = () => fetchBoard(wId, bId);

    const onDragEnd = useCallback(async (result: DropResult) => {
        if (!result.destination || !currentBoard) return;
        const { source, destination, draggableId } = result;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;
        await reorderCards(wId, bId, draggableId, destination.droppableId, destination.index);
    }, [currentBoard, wId, bId]);

    const addList = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!listTitle.trim()) return;
        try { await api.post(`/workspaces/${wId}/boards/${bId}/lists`, { title: listTitle.trim() }); setListTitle(""); setShowAddList(false); refresh(); }
        catch { toast.error("Failed to create list"); }
    };

    if (authLoading || isLoading || !currentBoard) {
        return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}><Loader2 size={24} className="spinner" style={{ color: "var(--accent)" }} /></div>;
    }

    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-base)" }}>
            {/* Header */}
            <header style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 24px", flexShrink: 0, background: "var(--bg-surface)", borderBottom: "1px solid var(--border-hover)" }}>
                <button onClick={() => router.push("/dashboard")} style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>
                    <ArrowLeft size={16} />
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 24, height: 4, borderRadius: 2, background: "var(--accent)" }} />
                    <h1 style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>{currentBoard.title}</h1>
                </div>
            </header>

            {/* Board */}
            <DragDropContext onDragEnd={onDragEnd}>
                <div style={{ flex: 1, display: "flex", gap: 16, padding: 16, overflowX: "auto", alignItems: "flex-start" }}>
                    {currentBoard.lists.map((list) => (
                        <ListColumn key={list.id} list={list} workspaceId={wId} boardId={bId} onCardClick={setSelectedCard} onRefresh={refresh} />
                    ))}

                    {/* Add List */}
                    <div style={{ flexShrink: 0, width: 280 }}>
                        {showAddList ? (
                            <form onSubmit={addList} style={{ borderRadius: 12, padding: 12, background: "var(--bg-surface)", border: "1px solid var(--border-hover)" }}>
                                <input type="text" value={listTitle} onChange={(e) => setListTitle(e.target.value)} placeholder="List title..." style={{ fontSize: 13, marginBottom: 8 }} autoFocus />
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button type="submit" className="btn-primary" style={{ fontSize: 12, padding: "6px 14px" }}>Add List</button>
                                    <button type="button" onClick={() => setShowAddList(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "6px 10px" }}><X size={14} /></button>
                                </div>
                            </form>
                        ) : (
                            <button onClick={() => setShowAddList(true)}
                                style={{ width: "100%", padding: 14, borderRadius: 12, fontSize: 13, display: "flex", alignItems: "center", gap: 8, border: "2px dashed var(--border-hover)", background: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                                <Plus size={16} /> Add another list
                            </button>
                        )}
                    </div>
                </div>
            </DragDropContext>

            {selectedCard && <CardModal card={selectedCard} workspaceId={wId} boardId={bId} onClose={() => setSelectedCard(null)} onRefresh={refresh} />}
        </div>
    );
}
