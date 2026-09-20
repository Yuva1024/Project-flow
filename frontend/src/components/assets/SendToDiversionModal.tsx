"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    GitBranch,
    Folder,
    Box,
    ArrowRight,
    Loader2,
    Key,
    Eye,
    EyeOff,
    RefreshCw,
    FolderTree,
    CheckCircle2
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface SendToDiversionModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: {
        id: string;
        fileName: string;
        fileSize?: number;
        mimeType?: string;
        fileUrl?: string;
    } | null;
    workspaceId: string;
    onSuccess?: (result?: any) => void;
}

interface DiversionRepo {
    id: string;
    name: string;
    defaultBranch: string;
    description?: string;
    syncGitRepoUrl?: string;
}

const STORAGE_KEY_API_KEY = 'diversion_api_key';
const STORAGE_KEY_REPO = 'diversion_last_repo';
const STORAGE_KEY_PATH = 'diversion_last_path';

export default function SendToDiversionModal({
    isOpen,
    onClose,
    asset,
    workspaceId,
    onSuccess,
}: SendToDiversionModalProps) {
    // API Key State
    const [apiKey, setApiKey] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [isApiKeyConnected, setIsApiKeyConnected] = useState(false);

    // Repositories State
    const [repos, setRepos] = useState<DiversionRepo[]>([]);
    const [isLoadingRepos, setIsLoadingRepos] = useState(false);
    const [repoId, setRepoId] = useState('');
    const [isManualRepo, setIsManualRepo] = useState(false);
    const [branch, setBranch] = useState('main');

    // Folders State
    const [folders, setFolders] = useState<string[]>([]);
    const [isLoadingFolders, setIsLoadingFolders] = useState(false);
    const [targetPath, setTargetPath] = useState('');

    // Form Submission State
    const [commitMessage, setCommitMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const initialLoadDoneRef = React.useRef(false);

    // Fetch Folders for a given repository & branch
    const fetchFolders = useCallback(async (targetRepoId: string, targetBranch: string, token: string) => {
        if (!targetRepoId || !token) return;
        setIsLoadingFolders(true);
        try {
            const response = await api.post(`/workspaces/${workspaceId}/assets/diversion/folders`, {
                repoId: targetRepoId,
                branch: targetBranch || 'main',
                apiKey: token,
            });
            const fetched = response.data?.folders || [];
            setFolders(fetched);
        } catch (error) {
            console.warn('[Diversion] Could not load folders:', error);
            setFolders([]);
        } finally {
            setIsLoadingFolders(false);
        }
    }, [workspaceId]);

    // Fetch Repositories with a given token
    const fetchRepositories = useCallback(async (token: string, initialRepoId?: string) => {
        if (!token.trim()) return;
        setIsLoadingRepos(true);
        try {
            const response = await api.post(`/workspaces/${workspaceId}/assets/diversion/repos`, {
                apiKey: token.trim(),
            });
            const fetchedRepos: DiversionRepo[] = response.data?.repos || [];
            setRepos(fetchedRepos);
            setIsApiKeyConnected(true);

            if (fetchedRepos.length > 0) {
                // Check if the candidate repo is in the fetched list
                const candidateRepoId = initialRepoId;
                const matchedRepo = candidateRepoId ? fetchedRepos.find((r) => r.id === candidateRepoId) : undefined;

                const activeRepo = matchedRepo || fetchedRepos[0];
                setRepoId(activeRepo.id);
                setIsManualRepo(false);
                const activeBranch = activeRepo.defaultBranch || 'main';
                setBranch(activeBranch);

                // Fetch folder hierarchy for this repository
                fetchFolders(activeRepo.id, activeBranch, token.trim());
            } else {
                setIsManualRepo(true);
            }
        } catch (error: any) {
            console.error('[Diversion] Failed to fetch repositories:', error);
            setIsApiKeyConnected(false);
            setIsManualRepo(true);
            const msg = error?.response?.data?.message || 'Invalid Diversion API Key or network error';
            toast.error(msg);
        } finally {
            setIsLoadingRepos(false);
        }
    }, [fetchFolders, workspaceId]);

    // Load initial state from localStorage when modal opens
    useEffect(() => {
        if (!isOpen) {
            initialLoadDoneRef.current = false;
            return;
        }

        if (initialLoadDoneRef.current) return;
        initialLoadDoneRef.current = true;

        if (typeof window !== 'undefined') {
            const savedApiKey = localStorage.getItem(STORAGE_KEY_API_KEY) || '';
            const savedRepo = localStorage.getItem(STORAGE_KEY_REPO) || '';
            const savedPath = localStorage.getItem(STORAGE_KEY_PATH) || '';

            setApiKey(savedApiKey);
            setRepoId(savedRepo);
            setTargetPath(savedPath || '/');
            setBranch('main');
            setCommitMessage('');

            if (savedApiKey) {
                fetchRepositories(savedApiKey, savedRepo);
            }
        }
    }, [isOpen, fetchRepositories]);

    if (!isOpen || !asset) return null;

    // Handle manual trigger to save & test API key
    const handleConnectApiKey = () => {
        if (!apiKey.trim()) {
            toast.error('Please enter a Diversion API Key');
            return;
        }
        if (typeof window !== 'undefined') {
            localStorage.setItem(STORAGE_KEY_API_KEY, apiKey.trim());
        }
        fetchRepositories(apiKey.trim(), repoId);
    };

    // Handle repository selection change
    const handleRepoChange = (selectedId: string) => {
        if (selectedId === '__manual__') {
            setIsManualRepo(true);
            setRepoId('');
            setFolders([]);
        } else {
            setIsManualRepo(false);
            setRepoId(selectedId);
            const found = repos.find((r) => r.id === selectedId);
            const newBranch = found?.defaultBranch || 'main';
            setBranch(newBranch);
            fetchFolders(selectedId, newBranch, apiKey);
        }
    };

    // Destination preview calculation (normalize Windows backslashes to standard forward slashes)
    const normalizedPath = targetPath.trim().replace(/\\+/g, '/').replace(/^\/+|\/+$/g, '');
    const fullDestinationPath = normalizedPath
        ? `${normalizedPath}/${asset.fileName}`
        : asset.fileName;

    const destinationPreview = `${repoId.trim() || '<repo-id>'} / ${branch.trim() || 'main'} / ${fullDestinationPath}`;

    // Submit and stream asset to Diversion
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!apiKey.trim()) {
            toast.error('Diversion API Key is required');
            return;
        }

        if (!repoId.trim()) {
            toast.error('Please select or enter a Diversion Repository ID');
            return;
        }

        if (!targetPath.trim()) {
            toast.error('Please specify a target folder path');
            return;
        }

        setIsLoading(true);
        const toastId = toast.loading('Streaming asset to Diversion...', { id: 'diversion-export' });

        try {
            const endpoint = `/workspaces/${workspaceId}/assets/${asset.id}/send-to-diversion`;
            const payload = {
                repoId: repoId.trim(),
                branch: branch.trim() || 'main',
                targetPath: fullDestinationPath,
                commitMessage: commitMessage.trim() || undefined,
                apiKey: apiKey.trim(),
            };

            const response = await api.post(endpoint, payload);

            // Sticky State: Persist successful inputs in localStorage
            if (typeof window !== 'undefined') {
                localStorage.setItem(STORAGE_KEY_API_KEY, apiKey.trim());
                localStorage.setItem(STORAGE_KEY_REPO, repoId.trim());
                localStorage.setItem(STORAGE_KEY_PATH, targetPath.trim());
            }

            toast.success('Asset successfully committed to Diversion!', { id: toastId });
            if (onSuccess) {
                onSuccess(response.data);
            }
            onClose();
        } catch (error: any) {
            console.error('[Diversion Export Error]', error);
            const errorMsg = error?.response?.data?.message || error?.message || 'Failed to stream asset to Diversion';
            toast.error(errorMsg, { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AnimatePresence>
            <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                }}
                onClick={(e) => {
                    if (e.target === e.currentTarget && !isLoading) onClose();
                }}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 16 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                    className="w-full max-w-lg max-h-[92vh] overflow-y-auto flex flex-col my-auto"
                    style={{
                        background: 'var(--bg-surface, #18181b)',
                        border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                        borderRadius: 'var(--radius-xl, 16px)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.06)',
                    }}
                >
                    {/* Header */}
                    <div
                        className="px-6 py-5 flex items-center justify-between border-b sticky top-0 z-10"
                        style={{
                            background: 'var(--bg-surface, #18181b)',
                            borderColor: 'var(--border, rgba(255, 255, 255, 0.08))',
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(168, 85, 247, 0.25))',
                                    color: '#818cf8',
                                    border: '1px solid rgba(99, 102, 241, 0.35)',
                                }}
                            >
                                <GitBranch size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white m-0 tracking-tight">
                                    Send to Diversion
                                </h3>
                                <p className="text-xs m-0 text-neutral-400 mt-0.5">
                                    Direct zero-disk stream from Cloudflare R2 to VCS
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
                            style={{ background: 'transparent' }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Form Body */}
                    <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                        {/* Asset Summary Pill */}
                        <div
                            className="p-3 rounded-xl flex items-center justify-between"
                            style={{
                                background: 'var(--bg-elevated, rgba(255, 255, 255, 0.03))',
                                border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                            }}
                        >
                            <div className="flex items-center gap-2.5 overflow-hidden">
                                <Box size={16} className="text-indigo-400 flex-shrink-0" />
                                <span className="text-xs font-semibold text-white truncate">
                                    {asset.fileName}
                                </span>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase tracking-wider flex-shrink-0">
                                R2 CAS Source
                            </span>
                        </div>

                        {/* SECTION 1: Diversion API Key & Connection */}
                        <div
                            className="p-3.5 rounded-xl flex flex-col gap-2.5"
                            style={{
                                background: 'rgba(255, 255, 255, 0.02)',
                                border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                            }}
                        >
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                                    <Key size={13} className="text-indigo-400" />
                                    Diversion API Key <span className="text-red-400">*</span>
                                </label>
                                {isApiKeyConnected ? (
                                    <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                                        <CheckCircle2 size={11} /> Connected ({repos.length} repos)
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-neutral-400">
                                        Saved in browser storage
                                    </span>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type={showApiKey ? 'text' : 'password'}
                                        required
                                        disabled={isLoading || isLoadingRepos}
                                        placeholder="Paste your Diversion API Key..."
                                        value={apiKey}
                                        onChange={(e) => {
                                            setApiKey(e.target.value);
                                            setIsApiKeyConnected(false);
                                        }}
                                        className="w-full pl-3 pr-9 py-2 text-xs rounded-lg text-white font-mono transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        style={{
                                            background: 'var(--bg-base, rgba(0, 0, 0, 0.35))',
                                            border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                                        style={{ background: 'transparent' }}
                                    >
                                        {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleConnectApiKey}
                                    disabled={isLoadingRepos || !apiKey.trim()}
                                    className="btn-secondary px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0"
                                    title="Connect and load repositories"
                                >
                                    {isLoadingRepos ? (
                                        <Loader2 size={13} className="animate-spin" />
                                    ) : (
                                        <RefreshCw size={13} />
                                    )}
                                    <span>{isApiKeyConnected ? 'Sync' : 'Connect'}</span>
                                </button>
                            </div>
                        </div>

                        {/* SECTION 2: Repository Selection */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                                    Repository <span className="text-red-400">*</span>
                                </label>
                                {repos.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setIsManualRepo(!isManualRepo)}
                                        className="text-[10px] text-indigo-400 hover:text-indigo-300 underline"
                                        style={{ background: 'transparent' }}
                                    >
                                        {isManualRepo ? 'Choose from list' : 'Enter manually'}
                                    </button>
                                )}
                            </div>

                            {!isManualRepo && repos.length > 0 ? (
                                <select
                                    value={repoId}
                                    disabled={isLoading || isLoadingRepos}
                                    onChange={(e) => handleRepoChange(e.target.value)}
                                    className="w-full px-3 py-2.5 text-xs rounded-lg text-white transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                    style={{
                                        background: 'var(--bg-base, rgba(0, 0, 0, 0.35))',
                                        border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                                    }}
                                >
                                    {repos.map((r) => (
                                        <option key={r.id} value={r.id} className="bg-neutral-900 text-white">
                                            {r.name} ({r.id})
                                        </option>
                                    ))}
                                    <option value="__manual__" className="bg-neutral-900 text-neutral-300">
                                        + Enter custom repository ID...
                                    </option>
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    required
                                    disabled={isLoading}
                                    placeholder="e.g. your-org/game-assets-repo"
                                    value={repoId}
                                    onChange={(e) => setRepoId(e.target.value)}
                                    className="w-full px-3.5 py-2.5 text-xs rounded-lg text-white transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    style={{
                                        background: 'var(--bg-base, rgba(0, 0, 0, 0.35))',
                                        border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                                    }}
                                />
                            )}
                            <p className="text-[10px] text-neutral-500 m-0">
                                {repos.length > 0 && !isManualRepo
                                    ? `Connected to ${repos.length} repositories from your Diversion account.`
                                    : 'Specify the Diversion repository name or full path.'}
                            </p>
                        </div>

                        {/* SECTION 3: Branch & Folder Hierarchy Selection */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {/* Branch */}
                            <div className="flex flex-col gap-1.5 sm:col-span-1">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                                    Branch
                                </label>
                                <input
                                    type="text"
                                    disabled={isLoading}
                                    placeholder="main"
                                    value={branch}
                                    onChange={(e) => {
                                        const newBranch = e.target.value;
                                        setBranch(newBranch);
                                        if (repoId && apiKey) {
                                            fetchFolders(repoId, newBranch, apiKey);
                                        }
                                    }}
                                    className="w-full px-3 py-2 text-xs rounded-lg text-white transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    style={{
                                        background: 'var(--bg-base, rgba(0, 0, 0, 0.35))',
                                        border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                                    }}
                                />
                            </div>

                            {/* Folder Quick Selector (if available) */}
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                                        <FolderTree size={12} className="text-indigo-400" />
                                        Folder Browser
                                    </label>
                                    {isLoadingFolders && (
                                        <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                                            <Loader2 size={10} className="animate-spin" /> scanning...
                                        </span>
                                    )}
                                </div>

                                {folders.length > 0 ? (
                                    <select
                                        disabled={isLoading}
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                setTargetPath(e.target.value);
                                            }
                                        }}
                                        className="w-full px-3 py-2 text-xs rounded-lg text-white transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                        style={{
                                            background: 'var(--bg-base, rgba(0, 0, 0, 0.35))',
                                            border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                                        }}
                                    >
                                        <option value="">-- Choose existing folder --</option>
                                        <option value="/" className="bg-neutral-900 text-white">/ (Root folder)</option>
                                        {folders.map((folderPath) => (
                                            <option key={folderPath} value={`/${folderPath}`} className="bg-neutral-900 text-white">
                                                /{folderPath}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div
                                        className="px-3 py-2 text-xs rounded-lg text-neutral-400 flex items-center justify-between"
                                        style={{
                                            background: 'var(--bg-base, rgba(0, 0, 0, 0.2))',
                                            border: '1px solid var(--border, rgba(255, 255, 255, 0.08))',
                                        }}
                                    >
                                        <span className="text-[11px]">No subfolders found or repo root</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Target Folder Path Input */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                                Target Path in Repository <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                disabled={isLoading}
                                placeholder="e.g. /Assets/3DModels/Characters"
                                value={targetPath}
                                onChange={(e) => setTargetPath(e.target.value)}
                                className="w-full px-3.5 py-2.5 text-xs rounded-lg text-white font-mono transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                style={{
                                    background: 'var(--bg-base, rgba(0, 0, 0, 0.35))',
                                    border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                                }}
                            />
                            <p className="text-[10px] text-neutral-500 m-0">
                                Path where the asset binary will be stored inside the version control tree.
                            </p>
                        </div>

                        {/* Commit Message */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                                Commit Summary (Optional)
                            </label>
                            <input
                                type="text"
                                disabled={isLoading}
                                placeholder={`Add ${asset.fileName} via Project-flow`}
                                value={commitMessage}
                                onChange={(e) => setCommitMessage(e.target.value)}
                                className="w-full px-3.5 py-2 text-xs rounded-lg text-white transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                style={{
                                    background: 'var(--bg-base, rgba(0, 0, 0, 0.35))',
                                    border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                                }}
                            />
                        </div>

                        {/* Live Destination Preview */}
                        <div
                            className="p-3 rounded-xl flex flex-col gap-1.5 mt-1"
                            style={{
                                background: 'rgba(99, 102, 241, 0.06)',
                                border: '1px solid rgba(99, 102, 241, 0.22)',
                            }}
                        >
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                                <Folder size={12} />
                                Live VCS Destination Preview
                            </div>
                            <div className="font-mono text-xs text-neutral-200 break-all select-all py-1.5 px-2 rounded bg-black/30 border border-white/5">
                                {destinationPreview}
                            </div>
                        </div>

                        {/* Actions */}
                        <div
                            className="pt-4 border-t flex items-center justify-end gap-3 mt-1"
                            style={{ borderColor: 'var(--border, rgba(255, 255, 255, 0.08))' }}
                        >
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isLoading}
                                className="btn-secondary px-4 py-2 text-xs font-semibold rounded-lg disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isLoading || !apiKey.trim() || !repoId.trim() || !targetPath.trim()}
                                className="btn-primary px-5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        Streaming to Diversion...
                                    </>
                                ) : (
                                    <>
                                        <span>Stream to Diversion</span>
                                        <ArrowRight size={14} />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

