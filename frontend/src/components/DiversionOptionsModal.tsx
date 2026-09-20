"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    GitBranch,
    Key,
    Eye,
    EyeOff,
    CheckCircle2,
    AlertCircle,
    Loader2,
    ExternalLink,
    Trash2,
    Save,
    ShieldCheck,
    RefreshCw
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export const STORAGE_KEY_API_KEY = 'diversion_api_key';
export const STORAGE_KEY_DEFAULT_BRANCH = 'diversion_default_branch';

interface DiversionSettingsSectionProps {
    workspaceId?: string;
    onSaved?: (key: string) => void;
}

/**
 * Reusable Diversion settings form section.
 * Can be embedded inside the main settings modal or any settings view.
 */
export function DiversionSettingsSection({ workspaceId, onSaved }: DiversionSettingsSectionProps) {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [defaultBranch, setDefaultBranch] = useState('main');
    const [isTesting, setIsTesting] = useState(false);
    const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [repoCount, setRepoCount] = useState<number | null>(null);
    const [sampleRepos, setSampleRepos] = useState<string[]>([]);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedKey = localStorage.getItem(STORAGE_KEY_API_KEY) || '';
            const savedBranch = localStorage.getItem(STORAGE_KEY_DEFAULT_BRANCH) || 'main';
            setApiKey(savedKey);
            setDefaultBranch(savedBranch);
            if (savedKey) {
                setTestStatus('success');
            }
        }
    }, []);

    const handleSaveAndTest = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmedKey = apiKey.trim();

        if (!trimmedKey) {
            toast.error('Please enter a Diversion API Key');
            return;
        }

        setIsTesting(true);
        setErrorMessage('');

        try {
            let reposFound = 0;
            let repoNames: string[] = [];

            if (workspaceId) {
                const endpoint = `/workspaces/${workspaceId}/assets/diversion/repos`;
                const res = await api.post(endpoint, { apiKey: trimmedKey });
                const repos = res.data?.repos || [];
                reposFound = repos.length;
                repoNames = repos.slice(0, 4).map((r: any) => r.name || r.id);
            }

            if (typeof window !== 'undefined') {
                localStorage.setItem(STORAGE_KEY_API_KEY, trimmedKey);
                localStorage.setItem(STORAGE_KEY_DEFAULT_BRANCH, defaultBranch.trim() || 'main');
            }

            setTestStatus('success');
            setRepoCount(reposFound);
            setSampleRepos(repoNames);
            toast.success(
                reposFound > 0
                    ? `Connected! Found ${reposFound} repository${reposFound === 1 ? '' : 'ies'}.`
                    : 'Diversion API Key saved!'
            );

            if (onSaved) onSaved(trimmedKey);
        } catch (err: any) {
            console.error('[Diversion Settings Error]', err);
            setTestStatus('error');
            const msg = err?.response?.data?.message || err?.message || 'Authentication failed. Please check your token.';
            setErrorMessage(msg);
            toast.error(msg);
        } finally {
            setIsTesting(false);
        }
    };

    const handleClearKey = () => {
        if (typeof window !== 'undefined') {
            localStorage.removeItem(STORAGE_KEY_API_KEY);
        }
        setApiKey('');
        setTestStatus('idle');
        setSampleRepos([]);
        setRepoCount(null);
        toast.success('Diversion API Key removed');
        if (onSaved) onSaved('');
    };

    return (
        <div className="flex flex-col gap-4">
            {/* Info banner */}
            <div
                className="p-3.5 rounded-xl flex items-start gap-3"
                style={{
                    background: 'rgba(99, 102, 241, 0.07)',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                }}
            >
                <ShieldCheck size={18} className="text-indigo-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-neutral-300 leading-relaxed">
                    Connect your Diversion account to push assets straight from Cloudflare R2 into version control without downloading heavy binaries to your local disk.
                </div>
            </div>

            {/* API Key Input */}
            <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                        <Key size={13} className="text-indigo-400" />
                        Diversion API Key <span className="text-red-400">*</span>
                    </label>
                    {testStatus === 'success' && apiKey && (
                        <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 size={12} /> Active
                        </span>
                    )}
                </div>

                <div className="relative">
                    <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={(e) => {
                            setApiKey(e.target.value);
                            setTestStatus('idle');
                        }}
                        placeholder="Paste your Diversion API key / Personal Access Token..."
                        required
                        disabled={isTesting}
                        className="w-full pl-3 pr-10 py-2.5 text-xs rounded-lg text-white font-mono transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        style={{
                            background: 'var(--bg-base, rgba(0, 0, 0, 0.35))',
                            border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white transition-colors"
                        style={{ background: 'transparent' }}
                    >
                        {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                </div>

                <div className="flex items-center justify-between text-[11px] mt-0.5">
                    <span className="text-neutral-500">
                        Generate a token in your Diversion account settings
                    </span>
                    <a
                        href="https://diversion.dev"
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 inline-flex transition-colors"
                    >
                        <span>Diversion Dashboard</span>
                        <ExternalLink size={11} />
                    </a>
                </div>
            </div>

            {/* Default Branch */}
            <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                    Default Branch
                </label>
                <input
                    type="text"
                    value={defaultBranch}
                    onChange={(e) => setDefaultBranch(e.target.value)}
                    placeholder="main"
                    disabled={isTesting}
                    className="w-full px-3 py-2 text-xs rounded-lg text-white transition-all focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    style={{
                        background: 'var(--bg-base, rgba(0, 0, 0, 0.35))',
                        border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                    }}
                />
            </div>

            {/* Status Feedback Card */}
            {testStatus === 'success' && (
                <div
                    className="p-3.5 rounded-xl flex flex-col gap-2"
                    style={{
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                    }}
                >
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                        <CheckCircle2 size={15} />
                        <span>Diversion API Connection Verified</span>
                    </div>
                    {sampleRepos.length > 0 && (
                        <div className="text-[11px] text-neutral-300 flex flex-col gap-1 pl-6">
                            <span className="text-neutral-400">Accessible Repositories:</span>
                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                                {sampleRepos.map((name) => (
                                    <span
                                        key={name}
                                        className="px-2 py-0.5 rounded bg-black/30 border border-white/10 font-mono text-[10px] text-neutral-200"
                                    >
                                        {name}
                                    </span>
                                ))}
                                {repoCount && repoCount > sampleRepos.length && (
                                    <span className="text-[10px] text-neutral-400 self-center">
                                        +{repoCount - sampleRepos.length} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {testStatus === 'error' && (
                <div
                    className="p-3.5 rounded-xl flex items-start gap-2.5"
                    style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                    }}
                >
                    <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-red-300 leading-relaxed">
                        {errorMessage || 'Failed to authenticate with Diversion. Please check your token.'}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex items-center justify-between">
                {apiKey ? (
                    <button
                        type="button"
                        onClick={handleClearKey}
                        disabled={isTesting}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        style={{ background: 'transparent' }}
                    >
                        <Trash2 size={13} />
                        <span>Remove Key</span>
                    </button>
                ) : (
                    <div />
                )}

                <button
                    type="button"
                    onClick={() => handleSaveAndTest()}
                    disabled={isTesting || !apiKey.trim()}
                    className="btn-primary px-5 py-2 text-xs font-semibold rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isTesting ? (
                        <>
                            <Loader2 size={14} className="animate-spin" />
                            <span>Verifying...</span>
                        </>
                    ) : (
                        <>
                            <Save size={14} />
                            <span>Save & Connect</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

interface DiversionOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    workspaceId?: string;
    onSave?: (key: string) => void;
}

/**
 * Standalone Diversion Options Modal.
 */
export default function DiversionOptionsModal({
    isOpen,
    onClose,
    workspaceId,
    onSave,
}: DiversionOptionsModalProps) {
    if (!isOpen) return null;

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
                    if (e.target === e.currentTarget) onClose();
                }}
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 16 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 16 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                    className="w-full max-w-lg overflow-hidden flex flex-col my-auto"
                    style={{
                        background: 'var(--bg-surface, #18181b)',
                        border: '1px solid var(--border, rgba(255, 255, 255, 0.12))',
                        borderRadius: 'var(--radius-xl, 16px)',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.06)',
                    }}
                >
                    {/* Header */}
                    <div
                        className="px-6 py-5 flex items-center justify-between border-b"
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
                                    Diversion VCS Options
                                </h3>
                                <p className="text-xs m-0 text-neutral-400 mt-0.5">
                                    Configure your Diversion token for zero-disk asset export
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-neutral-400 hover:text-white transition-colors"
                            style={{ background: 'transparent' }}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-6">
                        <DiversionSettingsSection
                            workspaceId={workspaceId}
                            onSaved={(key) => {
                                if (onSave) onSave(key);
                            }}
                        />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
