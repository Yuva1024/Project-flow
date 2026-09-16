"use client";
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { 
    Folder, FolderPlus, Tag, Search, Upload, Grid3x3, List, 
    Trash2, MoreHorizontal, File, Image as ImageIcon, Music, Video, Box, Plus
} from 'lucide-react';

interface AssetLibraryProps {
    workspaceId: string;
    onSelectAsset: (assetId: string) => void;
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

export default function AssetLibrary({ workspaceId, onSelectAsset }: AssetLibraryProps) {
    const [assets, setAssets] = useState<any[]>([]);
    const [folders, setFolders] = useState<any[]>([]);
    const [tags, setTags] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedMimeTypes, setSelectedMimeTypes] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    
    // New folder/tag states
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [showNewTag, setShowNewTag] = useState(false);
    const [newTagName, setNewTagName] = useState('');

    const fetchAssets = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (selectedFolder) params.append('folderId', selectedFolder);
            if (searchQuery) params.append('search', searchQuery);
            if (selectedTags.length > 0) params.append('tagId', selectedTags.join(','));
            if (selectedMimeTypes.length > 0) {
                params.append('mimeType', selectedMimeTypes.join(','));
            }

            const { data } = await api.get(`/workspaces/${workspaceId}/assets?${params.toString()}`);
            setAssets(data.assets || []);
        } catch (error) {
            console.error("Failed to fetch assets", error);
            toast.error("Failed to load assets");
        } finally {
            setLoading(false);
        }
    };

    const fetchFoldersAndTags = async () => {
        try {
            const [fRes, tRes] = await Promise.all([
                api.get(`/workspaces/${workspaceId}/assets/folders`),
                api.get(`/workspaces/${workspaceId}/assets/tags`)
            ]);
            setFolders(fRes.data || []);
            setTags(tRes.data || []);
        } catch (error) {
            console.error("Failed to fetch taxonomy", error);
        }
    };

    useEffect(() => {
        fetchFoldersAndTags();
    }, [workspaceId]);

    useEffect(() => {
        const debounce = setTimeout(fetchAssets, 300);
        return () => clearTimeout(debounce);
    }, [workspaceId, selectedFolder, selectedTags, selectedMimeTypes, searchQuery]);

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;
        try {
            await api.post(`/workspaces/${workspaceId}/assets/folders`, { name: newFolderName });
            setNewFolderName('');
            setShowNewFolder(false);
            fetchFoldersAndTags();
            toast.success("Folder created");
        } catch (error) {
            toast.error("Failed to create folder");
        }
    };

    const handleCreateTag = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTagName.trim()) return;
        try {
            await api.post(`/workspaces/${workspaceId}/assets/tags`, { name: newTagName, color: '#5b64d8' });
            setNewTagName('');
            setShowNewTag(false);
            fetchFoldersAndTags();
            toast.success("Tag created");
        } catch (error) {
            toast.error("Failed to create tag");
        }
    };

    const handleUploadFiles = async (files: FileList | File[]) => {
        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('file', file);
        });
        if (selectedFolder) {
            formData.append('folderId', selectedFolder);
        }

        const toastId = toast.loading(`Uploading ${files.length} file(s)...`);
        try {
            await api.post(`/workspaces/${workspaceId}/assets`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success("Upload complete", { id: toastId });
            fetchAssets();
        } catch (error) {
            console.error(error);
            toast.error("Upload failed", { id: toastId });
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleUploadFiles(e.dataTransfer.files);
        }
    };

    const renderIcon = (mime: string) => {
        const cat = getMimeCategory(mime);
        if (cat === 'image') return <ImageIcon size={32} color="var(--text-muted)" />;
        if (cat === 'video') return <Video size={32} color="var(--text-muted)" />;
        if (cat === 'audio') return <Music size={32} color="var(--text-muted)" />;
        if (cat === '3d') return <Box size={32} color="var(--text-muted)" />;
        return <File size={32} color="var(--text-muted)" />;
    };

    return (
        <div style={{ display: 'flex', height: '100%', minHeight: 0 }} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
            {/* Sidebar */}
            <div style={{ 
                width: 240, borderRight: '1px solid var(--border)', background: 'var(--bg-surface)', 
                display: 'flex', flexDirection: 'column', padding: 16, overflowY: 'auto' 
            }}>
                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Folders</span>
                        <button onClick={() => setShowNewFolder(!showNewFolder)} className="btn-ghost" style={{ padding: 4 }}>
                            <FolderPlus size={14} />
                        </button>
                    </div>
                    {showNewFolder && (
                        <form onSubmit={handleCreateFolder} style={{ marginBottom: 8 }}>
                            <input autoFocus type="text" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name" style={{ padding: '4px 8px', fontSize: 12, borderRadius: 'var(--radius-sm)' }} />
                        </form>
                    )}
                    <button 
                        onClick={() => setSelectedFolder(null)}
                        style={{
                            width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                            background: selectedFolder === null ? 'var(--bg-active)' : 'transparent',
                            color: selectedFolder === null ? 'var(--text-primary)' : 'var(--text-secondary)',
                            fontSize: 13, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
                        }}
                    >
                        <Folder size={14} /> All Files
                    </button>
                    {folders.map(f => (
                        <button 
                            key={f.id} onClick={() => setSelectedFolder(f.id)}
                            style={{
                                width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                                background: selectedFolder === f.id ? 'var(--bg-active)' : 'transparent',
                                color: selectedFolder === f.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontSize: 13, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginTop: 2
                            }}
                        >
                            <Folder size={14} /> {f.name}
                        </button>
                    ))}
                </div>

                <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Tags</span>
                        <button onClick={() => setShowNewTag(!showNewTag)} className="btn-ghost" style={{ padding: 4 }}>
                            <Plus size={14} />
                        </button>
                    </div>
                    {showNewTag && (
                        <form onSubmit={handleCreateTag} style={{ marginBottom: 8 }}>
                            <input autoFocus type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Tag name" style={{ padding: '4px 8px', fontSize: 12, borderRadius: 'var(--radius-sm)' }} />
                        </form>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {tags.map(t => {
                            const active = selectedTags.includes(t.id);
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        setSelectedTags(active ? selectedTags.filter(id => id !== t.id) : [...selectedTags, t.id]);
                                    }}
                                    style={{
                                        padding: '4px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                                        background: active ? t.color || 'var(--accent)' : 'var(--bg-elevated)',
                                        color: active ? '#fff' : 'var(--text-secondary)',
                                        border: `1px solid ${active ? 'transparent' : 'var(--border)'}`,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {t.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>File Type</span>
                    {['3D Model', 'Image', 'Audio', 'Video'].map(type => {
                        const val = type.toLowerCase().split(' ')[0];
                        const active = selectedMimeTypes.includes(val);
                        return (
                            <label key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, cursor: 'pointer' }}>
                                <input 
                                    type="checkbox" 
                                    checked={active}
                                    onChange={() => {
                                        setSelectedMimeTypes(active ? selectedMimeTypes.filter(t => t !== val) : [...selectedMimeTypes, val]);
                                    }}
                                    style={{ width: 14, height: 14 }}
                                />
                                {type}
                            </label>
                        );
                    })}
                </div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {/* Topbar */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: 400 }}>
                        <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--text-muted)' }} />
                        <input 
                            type="text" 
                            placeholder="Search assets..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{ paddingLeft: 36, height: 36, borderRadius: 'var(--radius)' }} 
                        />
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <button onClick={() => setViewMode('grid')} className="btn-ghost" style={{ padding: 8, background: viewMode === 'grid' ? 'var(--bg-active)' : 'transparent' }}>
                            <Grid3x3 size={16} />
                        </button>
                        <button onClick={() => setViewMode('list')} className="btn-ghost" style={{ padding: 8, background: viewMode === 'list' ? 'var(--bg-active)' : 'transparent' }}>
                            <List size={16} />
                        </button>
                    </div>
                </div>

                {/* Asset Area */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>Loading assets...</div>
                    ) : assets.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon"><ImageIcon size={24} /></div>
                            <div className="empty-state-title">No assets found</div>
                            <div className="empty-state-desc">Upload files to get started.</div>
                            <label className="btn-primary" style={{ marginTop: 16, cursor: 'pointer' }}>
                                <Upload size={14} /> Upload File
                                <input type="file" multiple hidden onChange={(e) => e.target.files && handleUploadFiles(e.target.files)} />
                            </label>
                        </div>
                    ) : viewMode === 'grid' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                            {assets.map(asset => (
                                <div 
                                    key={asset.id} 
                                    onClick={() => onSelectAsset(asset.id)}
                                    className="glass-panel-interactive"
                                    style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
                                >
                                    <div style={{ height: 120, background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                        {getMimeCategory(asset.mimeType) === 'image' ? (
                                            <img src={asset.url} alt={asset.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            renderIcon(asset.mimeType)
                                        )}
                                    </div>
                                    <div style={{ padding: 12, flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={asset.fileName}>
                                            {asset.fileName}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                            {formatFileSize(asset.fileSize)}
                                        </div>
                                        {asset.tags && asset.tags.length > 0 && (
                                            <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                                                {asset.tags.map((t: any) => (
                                                    <span key={t.tag.id} style={{ width: 8, height: 8, borderRadius: '50%', background: t.tag.color || 'var(--accent)' }} title={t.tag.name} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ width: '100%' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '8px 16px' }}>Name</th>
                                        <th style={{ padding: '8px 16px' }}>Size</th>
                                        <th style={{ padding: '8px 16px' }}>Type</th>
                                        <th style={{ padding: '8px 16px' }}>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {assets.map(asset => (
                                        <tr key={asset.id} onClick={() => onSelectAsset(asset.id)} style={{ borderBottom: '1px solid var(--border-hover)', cursor: 'pointer' }}>
                                            <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                                                {renderIcon(asset.mimeType)}
                                                <span style={{ fontSize: 13, fontWeight: 600 }}>{asset.fileName}</span>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{formatFileSize(asset.fileSize)}</td>
                                            <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{getMimeCategory(asset.mimeType)}</td>
                                            <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{new Date(asset.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Upload Zone Indicator */}
                <AnimatePresence>
                    {isDragging && (
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            style={{
                                position: 'absolute', inset: 0, background: 'rgba(91, 100, 216, 0.1)', backdropFilter: 'blur(2px)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                border: '2px dashed var(--accent)', zIndex: 50, borderRadius: 'var(--radius)'
                            }}
                        >
                            <Upload size={48} color="var(--accent)" style={{ marginBottom: 16 }} />
                            <h2 style={{ color: 'var(--accent)', fontSize: 20, fontWeight: 700 }}>Drop files to upload</h2>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Always visible bottom dropzone prompt */}
                {!isDragging && (
                    <div style={{
                        padding: '12px', textAlign: 'center', borderTop: '1px dashed var(--border)',
                        background: 'var(--bg-surface)', color: 'var(--text-muted)', fontSize: 12
                    }}>
                        Drag & drop files here or <label style={{ color: 'var(--accent)', cursor: 'pointer' }}>click to upload<input type="file" multiple hidden onChange={(e) => e.target.files && handleUploadFiles(e.target.files)} /></label>
                    </div>
                )}
            </div>
        </div>
    );
}
