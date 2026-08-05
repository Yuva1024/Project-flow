"use client";

import React, { useState, useEffect, useRef } from "react";
import { Box, UploadCloud, AlertTriangle, AlertCircle, RefreshCw, Sparkles, FileCode, ArrowDownToLine } from "lucide-react";

declare global {
    namespace JSX {
        interface IntrinsicElements {
            'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                src?: string;
                alt?: string;
                'environment-image'?: string;
                exposure?: string;
                'shadow-intensity'?: string;
                'camera-controls'?: boolean;
                'auto-rotate'?: boolean;
                'touch-action'?: string;
                reveal?: string;
            };
        }
    }
}

interface Attachment3D {
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
}

interface ModelViewer3DProps {
    initialModelUrl?: string;
    onModelChange?: (url: string, fileInfo?: { name: string; size: number; attachmentId?: string }) => void;
    onFileUpload?: (file: File) => Promise<{ fileUrl: string; attachmentId?: string } | null>;
    onAttachmentSelect?: (attachment: Attachment3D) => void;
    availableAttachments?: Attachment3D[];
    title?: string;
}

export default function ModelViewer3D({ initialModelUrl = "", onModelChange, onFileUpload, onAttachmentSelect, availableAttachments = [], title }: ModelViewer3DProps) {
    const [modelSrc, setModelSrc] = useState<string>(initialModelUrl);
    const [fileName, setFileName] = useState<string>("");
    const [fileSize, setFileSize] = useState<number | null>(null);
    const [isDragOver, setIsDragOver] = useState<boolean>(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [sizeWarning, setSizeWarning] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isUploading, setIsUploading] = useState<boolean>(false);
    const [loadProgress, setLoadProgress] = useState<number>(0);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [autoRotate, setAutoRotate] = useState<boolean>(false);

    const [isModelRevealed, setIsModelRevealed] = useState<boolean>(false);

    const modelViewerRef = useRef<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const lastUploadedCloudUrl = useRef<string | null>(null);

    // Sync initial model URL if passed from parent
    useEffect(() => {
        if (initialModelUrl && initialModelUrl !== modelSrc) {
            // If the incoming URL is the one we just uploaded, don't override our local blob URL!
            if (initialModelUrl === lastUploadedCloudUrl.current) {
                return;
            }
            
            setModelSrc(initialModelUrl);
            setIsModelRevealed(false); // Reset revealed state for new external models
            
            if (initialModelUrl) {
                // Extract filename from URL if available
                try {
                    const urlParts = initialModelUrl.split('/');
                    const lastPart = urlParts[urlParts.length - 1];
                    if (lastPart && (lastPart.endsWith('.glb') || lastPart.endsWith('.gltf'))) {
                        setFileName(decodeURIComponent(lastPart));
                    }
                } catch {}
            }
        }
    }, [initialModelUrl]);

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
    const processFile = async (file: File) => {
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

        setFileName(file.name);
        setFileSize(file.size);

        // 1. Set local object URL IMMEDIATELY so model renders on your device with 0-second delay
        const localBlobUrl = URL.createObjectURL(file);
        setModelSrc(localBlobUrl);
        setIsModelRevealed(true);
        setIsLoading(true);
        setLoadProgress(0);

        // 2. Upload to server/Cloudflare R2 in background to sync for all other users
        if (onFileUpload) {
            setIsUploading(true);
            try {
                const result = await onFileUpload(file);
                if (result && result.fileUrl) {
                    // Save to ref so we recognize this URL when it comes back from the parent/websocket
                    lastUploadedCloudUrl.current = result.fileUrl;
                    // Do NOT setModelSrc to the cloud URL here. Keep using the localBlobUrl for instant viewing!
                    if (onModelChange) {
                        onModelChange(result.fileUrl, { name: file.name, size: file.size, attachmentId: result.attachmentId });
                    }
                }
            } catch (err) {
                console.error("Cloud upload error for 3D model:", err);
            } finally {
                setIsUploading(false);
            }
        } else if (onModelChange) {
            onModelChange(localBlobUrl, { name: file.name, size: file.size });
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
        // Reset input so re-uploading the same file triggers onChange
        if (e.target) e.target.value = "";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        if (!isDragOver) setIsDragOver(true);
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

        // Check for internal attachment drag (JSON payload from text/plain or application/x-3d-attachment)
        const rawData = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("application/x-3d-attachment");
        if (rawData) {
            try {
                const att = JSON.parse(rawData) as (Attachment3D & { is3DAttachment?: boolean });
                if (att.fileUrl && (att.id || att.is3DAttachment)) {
                    setModelSrc(att.fileUrl);
                    setFileName(att.fileName);
                    setFileSize(att.fileSize);
                    setIsModelRevealed(true);
                    setIsLoading(true);
                    setLoadProgress(0);
                    if (onAttachmentSelect) {
                        onAttachmentSelect(att);
                    }
                    return;
                }
            } catch {}
        }

        // Otherwise, handle native file drop from desktop
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            processFile(files[0]);
        }
    };

    const handleSelectAttachment = (att: Attachment3D) => {
        setModelSrc(att.fileUrl);
        setFileName(att.fileName);
        setFileSize(att.fileSize);
        setIsModelRevealed(true);
        setIsLoading(true);
        setLoadProgress(0);
        if (onAttachmentSelect) {
            onAttachmentSelect(att);
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
                    cursor: isUploading ? "wait" : "pointer",
                    transition: "all 200ms ease",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    opacity: isUploading ? 0.7 : 1,
                    pointerEvents: isUploading ? "none" : "auto"
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
                            {isUploading ? "Uploading to cloud..." : fileName ? `Replace Model: ${fileName}` : "Upload 3D Model (.GLB / .GLTF)"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            {isUploading ? "Please wait while the file is being uploaded" : "Drag and drop file here or click to browse"}
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    className="btn-ghost"
                    style={{ fontSize: 11.5, padding: "6px 12px", pointerEvents: "none" }}
                >
                    {isUploading ? "Uploading..." : "Browse File"}
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

            {/* Uploading to Cloud Overlay */}
            {isUploading && (
                <div style={{
                    padding: "14px 18px",
                    borderRadius: "var(--radius)",
                    background: "rgba(99, 102, 241, 0.08)",
                    border: "1px solid rgba(99, 102, 241, 0.25)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--accent)"
                }}>
                    <div className="spinner"><RefreshCw size={16} /></div>
                    <span>Uploading 3D model to cloud storage... All team members will be able to see it.</span>
                </div>
            )}

            {/* 3D Model Container */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                position: "relative",
                width: "100%",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                border: isDragOver ? "2px solid var(--accent)" : "1px solid var(--border-hover)",
                background: "linear-gradient(145deg, #0b0d18 0%, #151829 100%)",
                minHeight: "360px",
                transition: "border 200ms ease"
            }}>
                {/* Drag-over overlay indicator */}
                {isDragOver && (
                    <div style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 50,
                        background: "rgba(99, 102, 241, 0.25)",
                        backdropFilter: "blur(4px)",
                        border: "2px dashed var(--accent)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        color: "#ffffff",
                        pointerEvents: "none"
                    }}>
                        <ArrowDownToLine size={32} style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 14, fontWeight: 800 }}>Drop 3D Model Here to Load</span>
                    </div>
                )}
                {/* 1. Neutral Placeholder state before upload — also shows available 3D attachments */}
                {!modelSrc && !isUploading && (
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        style={{
                            width: "100%",
                            minHeight: "360px",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 14,
                            color: "var(--text-muted)",
                            padding: 24,
                            textAlign: "center",
                            border: isDragOver ? "2px dashed var(--accent)" : "2px dashed transparent",
                            background: isDragOver ? "rgba(99, 102, 241, 0.08)" : "transparent",
                            transition: "all 200ms ease"
                        }}
                    >
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
                            No 3D model loaded
                        </span>
                        <span style={{ fontSize: 11.5, color: "var(--text-muted)", maxWidth: 320, lineHeight: 1.5 }}>
                            Upload a <code>.glb</code> / <code>.gltf</code> file above, drag one from the Attachments list, or pick from existing attachments below.
                        </span>

                        {/* Available 3D Attachments Picker */}
                        {availableAttachments.length > 0 && (
                            <div style={{ width: "100%", maxWidth: 360, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", marginBottom: 2 }}>
                                    Available 3D Attachments
                                </span>
                                {availableAttachments.map((att) => (
                                    <button
                                        key={att.id}
                                        type="button"
                                        onClick={() => handleSelectAttachment(att)}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            padding: "8px 12px",
                                            borderRadius: "var(--radius)",
                                            background: "rgba(255, 255, 255, 0.04)",
                                            border: "1px solid var(--border)",
                                            cursor: "pointer",
                                            color: "var(--text-primary)",
                                            transition: "all 150ms ease",
                                            width: "100%",
                                            textAlign: "left"
                                        }}
                                        onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "rgba(99, 102, 241, 0.1)"; }}
                                        onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)"; }}
                                    >
                                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(99, 102, 241, 0.15)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <Box size={14} />
                                        </div>
                                        <div style={{ overflow: "hidden", flex: 1 }}>
                                            <div style={{ fontSize: 11.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.fileName}</div>
                                            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatBytes(att.fileSize)}</div>
                                        </div>
                                        <ArrowDownToLine size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 2. Model Viewport & Controls */}
                {modelSrc && (() => {
                    const ModelViewer = 'model-viewer' as any;
                    return (
                    <>
                        <ModelViewer
                            ref={modelViewerRef}
                            src={modelSrc}
                            alt={title || fileName || "3D Model"}
                            environment-image="neutral"
                            exposure="1"
                            shadow-intensity="1"
                            camera-controls
                            auto-rotate={autoRotate ? true : undefined}
                            touch-action="pan-y"
                            reveal={modelSrc.startsWith("blob:") || isModelRevealed ? "auto" : "manual"}
                            poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                            style={{
                                width: "100%",
                                height: "360px",
                                display: "block",
                                backgroundColor: "#111322"
                            }}
                        >
                            {/* Custom Poster for Lazy Loading */}
                            {!modelSrc.startsWith("blob:") && !isModelRevealed && (
                                <div
                                    slot="poster"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setIsModelRevealed(true);
                                        modelViewerRef.current?.dismissPoster();
                                    }}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        backgroundColor: "#0b0d18",
                                        cursor: "pointer",
                                        backgroundImage: "radial-gradient(circle at center, #1a1e3a 0%, #0b0d18 100%)"
                                    }}
                                >
                                    <div style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        gap: 12,
                                        padding: "20px 30px",
                                        background: "rgba(255, 255, 255, 0.05)",
                                        backdropFilter: "blur(8px)",
                                        border: "1px solid rgba(255, 255, 255, 0.1)",
                                        borderRadius: "var(--radius-lg)",
                                        transition: "all 0.2s ease"
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)"}
                                    onMouseOut={(e) => e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"}
                                    >
                                        <div style={{ 
                                            width: 48, 
                                            height: 48, 
                                            borderRadius: "50%", 
                                            background: "var(--accent)", 
                                            display: "flex", 
                                            alignItems: "center", 
                                            justifyContent: "center",
                                            boxShadow: "0 0 20px rgba(99, 102, 241, 0.4)"
                                        }}>
                                            <Box size={24} color="white" />
                                        </div>
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ fontSize: 14, fontWeight: 700, color: "white" }}>Load 3D Model</div>
                                            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Click to view interactive 3D asset</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </ModelViewer>

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
                    );
                })()}

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
