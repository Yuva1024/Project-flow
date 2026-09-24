"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Search, FolderKanban, SquareKanban, CornerDownLeft, Loader2 } from "lucide-react";

interface BoardResult { id: string; title: string; workspaceId: string; _count: { lists: number }; }
interface CardResult {
    id: string; title: string; priority?: string | null;
    list: { title: string; board: { id: string; title: string; workspaceId: string } };
}

export default function CommandPalette() {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [boards, setBoards] = useState<BoardResult[]>([]);
    const [cards, setCards] = useState<CardResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The debounce cancels a pending timer, not a request already in flight, so
    // a slow response to an earlier query could land last and overwrite results
    // for the newer one. Only the latest request is allowed to write.
    const latestRequest = useRef(0);

    // Global hotkey
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen(o => !o);
            }
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // Focus input when opening + reset state
    useEffect(() => {
        if (open) {
            setQuery("");
            setBoards([]);
            setCards([]);
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 30);
        }
    }, [open]);

    // Debounced search
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const q = query.trim();
        if (q.length < 2) { setBoards([]); setCards([]); setSearching(false); return; }
        setSearching(true);
        debounceRef.current = setTimeout(async () => {
            const requestId = ++latestRequest.current;
            try {
                const { data } = await api.get(`/search?q=${encodeURIComponent(q)}`);
                if (requestId !== latestRequest.current) return;
                setBoards(data.boards || []);
                setCards(data.cards || []);
                setActiveIndex(0);
            } catch { /* search failures just leave the previous results */ }
            if (requestId === latestRequest.current) setSearching(false);
        }, 250);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [query]);

    const results = [
        ...boards.map(b => ({ type: "board" as const, id: b.id, board: b })),
        ...cards.map(c => ({ type: "card" as const, id: c.id, card: c })),
    ];

    const navigate = useCallback((item: (typeof results)[number]) => {
        if (!item) return;
        setOpen(false);
        if (item.type === "board") {
            router.push(`/board/${item.board.workspaceId}/${item.board.id}`);
        } else {
            router.push(`/board/${item.card.list.board.workspaceId}/${item.card.list.board.id}`);
        }
    }, [router]);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, results.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); navigate(results[activeIndex]); }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div 
                    className="cmdk-overlay" 
                    onMouseDown={() => setOpen(false)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <motion.div 
                        className="cmdk-panel" 
                        onMouseDown={e => e.stopPropagation()}
                        initial={{ opacity: 0, y: -8, scale: 0.985 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.985 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.2 }}
                    >
                        <div className="cmdk-input-row">
                            {searching ? <Loader2 size={15} className="spinner" style={{ color: "var(--accent)" }} /> : <Search size={15} style={{ color: "var(--text-muted)" }} />}
                            <input
                                ref={inputRef}
                                className="cmdk-input"
                                placeholder="Search boards and cards…"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={onKeyDown}
                                autoComplete="off"
                            />
                            <kbd className="cmdk-kbd">ESC</kbd>
                        </div>

                        <div className="cmdk-results">
                            {query.trim().length < 2 ? (
                                <div className="cmdk-empty">Type at least 2 characters to search across all your workspaces</div>
                            ) : results.length === 0 && !searching ? (
                                <div className="cmdk-empty">No matches for “{query.trim()}”</div>
                            ) : (
                                <>
                                    {boards.length > 0 && (
                                        <p className="cmdk-group-label"><FolderKanban size={11} /> Boards</p>
                                    )}
                                    {boards.map((b, i) => (
                                        <button
                                            key={`b-${b.id}`}
                                            className={`cmdk-item ${activeIndex === i ? "active" : ""}`}
                                            onMouseEnter={() => setActiveIndex(i)}
                                            onClick={() => navigate({ type: "board", id: b.id, board: b })}
                                        >
                                            <span className="cmdk-item-icon"><FolderKanban size={14} /></span>
                                            <span className="cmdk-item-title">{b.title}</span>
                                            <span className="cmdk-item-meta">{b._count.lists} lists</span>
                                        </button>
                                    ))}
                                    {cards.length > 0 && (
                                        <p className="cmdk-group-label"><SquareKanban size={11} /> Cards</p>
                                    )}
                                    {cards.map((c, i) => {
                                        const idx = boards.length + i;
                                        return (
                                            <button
                                                key={`c-${c.id}`}
                                                className={`cmdk-item ${activeIndex === idx ? "active" : ""}`}
                                                onMouseEnter={() => setActiveIndex(idx)}
                                                onClick={() => navigate({ type: "card", id: c.id, card: c })}
                                            >
                                                <span className="cmdk-item-icon"><SquareKanban size={14} /></span>
                                                <span className="cmdk-item-title">{c.title}</span>
                                                <span className="cmdk-item-meta">{c.list.board.title} · {c.list.title}</span>
                                            </button>
                                        );
                                    })}
                                    {results.length > 0 && activeIndex === results.length - 1 && (
                                        <div className="cmdk-hint"><CornerDownLeft size={10} /> Enter to open</div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="cmdk-footer">
                            <span><kbd className="cmdk-kbd">↑↓</kbd> navigate</span>
                            <span><kbd className="cmdk-kbd">↵</kbd> open</span>
                            <span><kbd className="cmdk-kbd">⌘K</kbd> toggle</span>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
