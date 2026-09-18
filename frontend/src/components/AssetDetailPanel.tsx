"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { X, Download, Trash2, File, Image as ImageIcon, Music, Video, Box, Tag, Plus } from 'lucide-react';


interface AssetDetailPanelProps {
    assetId: string;
    workspaceId: string;
    onClose: () => void;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function getMimeCategory(mime: string): string {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.includes('gltf') || mime.includes('glb') || mime.includes('fbx') || mime.includes('obj')) return '3d';
    return 'other';
}

export default function AssetDetailPanel({ assetId, workspaceId, onClose }: AssetDetailPanelProps) {
    const [asset, setAsset] = useState<any>(null);
    const [tags, setTags] = useState<any[]>([]); // All workspace tags
    const [loading, setLoading] = useState(true);
    const [showTagDropdown, setShowTagDropdown] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            setLoading(true);
            try {
                const [assetRes, tagsRes] = await Promise.all([
                    api.get(`/workspaces/${workspaceId}/assets/${assetId}`),
                    api.get(`/workspaces/${workspaceId}/assets/tags`)
                ]);
                console.log('[AssetDetail] asset response:', assetRes.data);
                setAsset(assetRes.data);
                setTags(tagsRes.data || []);
            } catch (error: any) {
                console.error("[AssetDetail] Failed to load:", error?.response?.status, error?.response?.data, error?.message);
                toast.error("Failed to load asset details");
                onClose();
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
        import('@google/model-viewer').catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetId, workspaceId]);

    const handleUpdateName = async (newName: string) => {
        if (!newName.trim() || newName === asset.fileName) return;
        try {
            await api.patch(`/workspaces/${workspaceId}/assets/${assetId}`, { fileName: newName });
            setAsset({ ...asset, fileName: newName });
            toast.success("Renamed successfully");
        } catch (error) {
            toast.error("Failed to rename");
        }
    };

    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this asset?")) return;
        try {
            await api.delete(`/workspaces/${workspaceId}/assets/${assetId}`);
            toast.success("Asset deleted");
            onClose();
        } catch (error) {
            toast.error("Failed to delete asset");
        }
    };

    const handleAddTag = async (tagId: string) => {
        try {
            await api.post(`/workspaces/${workspaceId}/assets/${assetId}/tags/${tagId}`);
            // Optimistic update
            const tagData = tags.find(t => t.id === tagId);
            setAsset({ ...asset, tags: [...asset.tags, { tag: tagData }] });
            setShowTagDropdown(false);
        } catch (error) {
            toast.error("Failed to add tag");
        }
    };

    const handleRemoveTag = async (tagId: string) => {
        try {
            await api.delete(`/workspaces/${workspaceId}/assets/${assetId}/tags/${tagId}`);
            setAsset({ ...asset, tags: asset.tags.filter((t: any) => t.tag.id !== tagId) });
        } catch (error) {
            toast.error("Failed to remove tag");
        }
    };

    if (loading || !asset) {
        return (
            <motion.div
                initial={{ x: 440 }}
                animate={{ x: 0 }}
                exit={{ x: 440 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: 440, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', zIndex: 50, padding: 24 }}
            >
                Loading...
            </motion.div>
        );
    }

    const category = getMimeCategory(asset.mimeType);

    const renderPreview = () => {
        if (category === 'image') {
            return <img src={asset.url} alt={asset.fileName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
        }
        if (category === '3d') {
            const ModelViewer = 'model-viewer' as any;
            return <ModelViewer src={asset.url} auto-rotate camera-controls shadow-intensity="1" style={{ width: '100%', height: '100%' }} />;
        }
        if (category === 'audio') {
            return <audio controls src={asset.url} style={{ width: '100%', marginTop: 'auto', marginBottom: 'auto' }} />;
        }
        if (category === 'video') {
            return <video controls src={asset.url} style={{ width: '100%', height: '100%' }} />;
        }
        return <File size={64} color="var(--text-muted)" />;
    };

    return (
        <>
            <div className="overlay-backdrop" onClick={onClose} style={{ zIndex: 49 }} />
            <motion.div
                initial={{ x: 440 }}
                animate={{ x: 0 }}
                exit={{ x: 440 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: 440, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', zIndex: 50, display: 'flex', flexDirection: 'column' }}
            >
                {/* Header */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Asset Details</h2>
                    <button onClick={onClose} className="btn-ghost" style={{ padding: 6 }}><X size={16} /></button>
                </div>

                {/* Preview Area */}
                <div style={{ height: 280, background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
                    {renderPreview()}
                </div>

                {/* Details */}
                <div style={{ padding: 24, flex: 1, overflowY: 'auto' }}>
                    <div style={{ marginBottom: 24 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>File Name</label>
                        <input 
                            type="text" 
                            defaultValue={asset.fileName}
                            onBlur={(e) => handleUpdateName(e.target.value)}
                            style={{ fontSize: 14, fontWeight: 600 }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Size</label>
                            <div style={{ fontSize: 13 }}>{formatFileSize(asset.fileSize)}</div>
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }}>Type</label>
                            <div style={{ fontSize: 13 }}>{asset.mimeType}</div>
                        </div>
                    </div>

                    {/* Tags */}
                    <div style={{ marginBottom: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Tags</label>
                            <div style={{ position: 'relative' }}>
                                <button onClick={() => setShowTagDropdown(!showTagDropdown)} className="btn-ghost" style={{ padding: '4px 8px', fontSize: 11 }}>
                                    <Plus size={12} style={{ marginRight: 4 }} /> Add Tag
                                </button>
                                {showTagDropdown && (
                                    <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8, width: 160, zIndex: 10, boxShadow: 'var(--shadow)' }}>
                                        {tags.filter(t => !asset.tags.some((at: any) => at.tag.id === t.id)).map(t => (
                                            <div key={t.id} onClick={() => handleAddTag(t.id)} style={{ padding: '6px 8px', fontSize: 12, cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                                                {t.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {asset.tags.map((t: any) => (
                                <span key={t.tag.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 999, background: t.tag.color || 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600 }}>
                                    {t.tag.name}
                                    <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleRemoveTag(t.tag.id)} />
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Linked Cards */}
                    <div style={{ marginBottom: 24 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8, display: 'block' }}>Linked Cards</label>
                        {asset.linkedCards && asset.linkedCards.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {asset.linkedCards.map((lc: any) => (
                                    <div key={lc.card.id} style={{ padding: 12, borderRadius: 'var(--radius)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 13 }}>
                                        {lc.card.title}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Not linked to any cards.</div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div style={{ padding: 24, borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
                    <a href={asset.url} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ flex: 1, textDecoration: 'none' }}>
                        <Download size={14} /> Download
                    </a>
                    <button onClick={handleDelete} className="btn-danger">
                        <Trash2 size={14} /> Delete
                    </button>
                </div>
            </motion.div>
        </>
    );
}
