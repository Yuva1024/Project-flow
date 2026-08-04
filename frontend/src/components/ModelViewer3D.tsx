"use client";

import React, { useState, useEffect, useRef } from "react";
import { Box, UploadCloud, AlertTriangle, AlertCircle, RefreshCw, Sparkles, CheckCircle2, FileCode } from "lucide-react";

interface ModelViewer3DProps {
    initialModelUrl?: string;
    onModelChange?: (url: string, fileInfo?: { name: string; size: number }) => void;
    title?: string;
}

export default function ModelViewer3D({ initialModelUrl = "", onModelChange, title }: ModelViewer3DProps) {
    const [modelSrc, setModelSrc] = useState<string>(initialModelUrl);
    const [fileName, setFileName] = useState<string>("");
    const [fileSize, setFileSize] = useState<number | null>(null);
    const [isDragOver, setIsDragOver] = useState<boolean>(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [sizeWarning, setSizeWarning] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [loadProgress, setLoadProgress] = useState<number>(0);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [autoRotate, setAutoRotate] = useState<boolean>(false);

    const modelViewerRef = useRef<any>(null);
    const currentObjectUrlRef = useRef<string | null>(null);
    const previousObjectUrlRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync initial model URL if passed from parent
    useEffect(() => {
        if (initialModelUrl && initialModelUrl !== modelSrc && !currentObjectUrlRef.current) {
            setModelSrc(initialModelUrl);
        }
    }, [initialModelUrl]);

    // Cleanup object URLs on unmount to prevent memory leaks
    useEffect(() => {
        return () => {
            if (currentObjectUrlRef.current) {
                URL.revokeObjectURL(currentObjectUrlRef.current);
            }
            if (previousObjectUrlRef.current) {
                URL.revokeObjectURL(previousObjectUrlRef.current);
            }
        };
    }, []);

    // Bind model-viewer events (progress, load, error)
    useEffect(() => {
        const mv = modelViewerRef.current;
        if (!mv) return;

        const handleProgress = (e: any) => {
            const progress = e.detail?.totalProgress ?? 0;
            setLoadProgress(Math.round(progress * 100));
        };

        const handleLoad = () => {
            setIsLoading(false);
            setLoadError(null);
            // Revoke previous object URL safely after new model completes loading
            if (previousObjectUrlRef.current) {
                URL.revokeObjectURL(previousObjectUrlRef.current);
                previousObjectUrlRef.current = null;
            }
        };

        const handleError = () => {
            setIsLoading(false);
            setLoadError("Couldn't load this model — check the export and try again");
        };

        mv.addEventListener("progress", handleProgress);
        mv.addEventListener("load", handleLoad);
        mv.addEventListener("error", handleError);

        return () => {
            mv.removeEventListener("progress", handleProgress);
            mv.removeEventListener("load", handleLoad);
            mv.removeEventListener("error", handleError);
        };
    }, [modelSrc]);

    // Handle File Selection and Validation
    const processFile = (file: File) => {
        setValidationError(null);
        setSizeWarning(null);
        setLoadError(null);

        if (!file) return;

        const nameLower = file.name.toLowerCase();
        const isGlbOrGltf = nameLower.endsWith(".glb") || nameLower.endsWith(".gltf");

        if (!isGlbOrGltf) {
            setValidationError("Only .glb/.gltf supported — export from Blender as glTF Binary.");
            return;
        }

        // Warn if file > 15MB (15 * 1024 * 1024 bytes)
        const maxRecommendedBytes = 15 * 1024 * 1024;
        if (file.size > maxRecommendedBytes) {
            setSizeWarning("File is over 15MB. Consider using Draco compression on export for faster loading.");
        }

        // Keep track of previous object URL to revoke after load
        if (currentObjectUrlRef.current) {
            previousObjectUrlRef.current = currentObjectUrlRef.current;
        }

        const objectUrl = URL.createObjectURL(file);
        currentObjectUrlRef.current = objectUrl;

        setFileName(file.name);
        setFileSize(file.size);
        setIsLoading(true);
        setLoadProgress(0);
        setModelSrc(objectUrl);

        if (onModelChange) {
            onModelChange(objectUrl, { name: file.name, size: file.size });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            processFile(files[0]);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
            {/* Drag and Drop / Upload Trigger Header */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                    border: isDragOver ? "2px dashed var(--accent)" : "1px dashed var(--border-active)",
                    borderRadius: "var(--radius)",
                    padding: "16px 20px",
                    background: isDragOver ? "rgba(99, 102, 241, 0.12)" : "var(--bg-elevated)",
                    cursor: "pointer",
                    transition: "all 200ms ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".glb,.gltf"
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: "rgba(99, 102, 241, 0.15)",
                        color: "var(--accent)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                    }}>
                        <UploadCloud size={18} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                            {fileName ? `Replace Model: ${fileName}` : "Upload 3D Model (.GLB / .GLTF)"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            Drag and drop file here or click to browse
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: 11.5, padding: "6px 12px", pointerEvents: "none" }}
                >
                    Browse File
                </button>
            </div>

            {/* Inline Validation Error Message */}
            {validationError && (
                <div style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                    color: "var(--danger)",
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8
                }}>
                    <AlertCircle size={15} style={{ flexShrink: 0 }} />
                    <span>{validationError}</span>
                </div>
            )}

            {/* Inline Size Warning Message */}
            {sizeWarning && !validationError && (
                <div style={{
                    padding: "10px 14px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.3)",
                    color: "var(--warning)",
                    fontSize: 11.5,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: 8
                }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                    <span>{sizeWarning}</span>
                </div>
            )}

            {/* 3D Model Container */}
            <div style={{
                position: "relative",
                width: "100%",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                border: "1px solid var(--border-hover)",
                background: "linear-gradient(145deg, #0b0d18 0%, #151829 100%)",
                minHeight: "360px"
            }}>
                {/* 1. Neutral Placeholder state before upload */}
                {!modelSrc && (
                    <div style={{
                        width: "100%",
                        height: "360px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 12,
                        color: "var(--text-muted)",
                        padding: 24,
                        textAlign: "center"
                    }}>
                        <div style={{
                            width: 52,
                            height: 52,
                            borderRadius: 16,
                            background: "rgba(255, 255, 255, 0.04)",
                            border: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}>
                            <Box size={26} style={{ color: "var(--accent)", opacity: 0.8 }} />
                        </div>
                        <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)" }}>
                            No 3D model uploaded yet
                        </span>
                        <span style={{ fontSize: 11.5, color: "var(--text-muted)", maxWidth: 300, lineHeight: 1.5 }}>
                            Upload a <code>.glb</code> or <code>.gltf</code> file above to view, inspect, and rotate your 3D asset in real time.
                        </span>
                    </div>
                )}

                {/* 2. Model Viewport & Controls */}
                {modelSrc && (
                    <>
                        {/* Explicit CSS Width and Height on model-viewer element */}
                        {/* @ts-ignore */}
                        <model-viewer
                            ref={modelViewerRef}
                            src={modelSrc}
                            alt={title || fileName || "3D Model"}
                            environment-image="neutral"
                            exposure="1"
                            shadow-intensity="1"
                            camera-controls
                            auto-rotate={autoRotate ? true : undefined}
                            touch-action="pan-y"
                            style={{
                                width: "100%",
                                height: "360px",
                                display: "block",
                                backgroundColor: "#111322"
                            }}
                        />

                        {/* Top Controls Overlay */}
                        <div style={{
                            position: "absolute",
                            top: 12,
                            right: 12,
                            display: "flex",
                            gap: 8,
                            zIndex: 10
                        }}>
                            <button
                                type="button"
                                onClick={() => setAutoRotate(!autoRotate)}
                                style={{
                                    padding: "6px 12px",
                                    borderRadius: 20,
                                    fontSize: 11,
                                    fontWeight: 700,
                                    background: autoRotate ? "var(--accent)" : "rgba(10, 12, 22, 0.8)",
                                    color: "#ffffff",
                                    border: "1px solid rgba(255, 255, 255, 0.15)",
                                    cursor: "pointer",
                                    backdropFilter: "blur(8px)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6
                                }}
                            >
                                <Sparkles size={12} />
                                {autoRotate ? "Auto-Rotate ON" : "Auto-Rotate OFF"}
                            </button>
                        </div>
                    </>
                )}

                {/* 3. Loading Overlay Spinner */}
                {isLoading && (
                    <div style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(10, 12, 22, 0.85)",
                        backdropFilter: "blur(6px)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 14,
                        zIndex: 20
                    }}>
                        <div className="spinner" style={{ color: "var(--accent)" }}>
                            <RefreshCw size={28} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#ffffff" }}>
                                Loading 3D Model... {loadProgress}%
                            </span>
                            <div style={{ width: 140, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                                <div style={{ width: `${loadProgress}%`, height: "100%", background: "var(--accent)", transition: "width 200ms ease" }} />
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. Error State Display */}
                {loadError && !isLoading && (
                    <div style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(15, 17, 30, 0.95)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 12,
                        padding: 24,
                        textAlign: "center",
                        zIndex: 25
                    }}>
                        <AlertCircle size={36} style={{ color: "var(--danger)" }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                            {loadError}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 280 }}>
                            Ensure the file is a valid binary glTF (.glb) or .gltf with embedded assets.
                        </span>
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn-ghost"
                            style={{ fontSize: 11.5, marginTop: 8 }}
                        >
                            Try Uploading Again
                        </button>
                    </div>
                )}
            </div>

            {/* Small Caption under the viewer with file name + size */}
            {fileName && !loadError && (
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 12px",
                    borderRadius: "var(--radius-sm)",
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border)",
                    fontSize: 11,
                    color: "var(--text-secondary)"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <FileCode size={13} style={{ color: "var(--accent)" }} />
                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{fileName}</span>
                    </div>
                    {fileSize !== null && (
                        <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>
                            {formatBytes(fileSize)}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
