"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Box, UploadCloud, RefreshCw, Sparkles, AlertCircle, Eye, EyeOff, Maximize2, RotateCcw, ArrowDownToLine, Layers } from "lucide-react";

interface Attachment3D {
    id: string;
    fileName: string;
    fileUrl: string;
    fileSize: number;
}

interface Three3DViewerProps {
    initialModelUrl?: string;
    onModelChange?: (url: string, fileInfo?: { name: string; size: number; attachmentId?: string }) => void;
    onFileUpload?: (file: File) => Promise<{ fileUrl: string; attachmentId?: string } | null>;
    onAttachmentSelect?: (attachment: Attachment3D) => void;
    availableAttachments?: Attachment3D[];
    title?: string;
}

export default function Three3DViewer({
    initialModelUrl = "",
    onModelChange,
    onFileUpload,
    onAttachmentSelect,
    availableAttachments = [],
    title
}: Three3DViewerProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Three.js internal references
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const controlsRef = useRef<OrbitControls | null>(null);
    const loadedModelRef = useRef<THREE.Object3D | null>(null);
    const animFrameRef = useRef<number | null>(null);
    const gridHelperRef = useRef<THREE.GridHelper | null>(null);

    // Component states
    const [modelUrl, setModelUrl] = useState<string>(initialModelUrl);
    const [fileName, setFileName] = useState<string>("");
    const [fileSize, setFileSize] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isUploading, setIsUploading] = useState<boolean>(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState<boolean>(false);

    // Interactive Three.js Toggles
    const [autoRotate, setAutoRotate] = useState<boolean>(false);
    const [wireframe, setWireframe] = useState<boolean>(false);
    const [showGrid, setShowGrid] = useState<boolean>(true);

    // Sync initialModelUrl prop changes
    useEffect(() => {
        if (initialModelUrl && initialModelUrl !== modelUrl) {
            setModelUrl(initialModelUrl);
            try {
                const parts = initialModelUrl.split("/");
                const name = parts[parts.length - 1];
                if (name && (name.endsWith(".glb") || name.endsWith(".gltf"))) {
                    setFileName(decodeURIComponent(name));
                }
            } catch {}
        }
    }, [initialModelUrl]);

    // Initialize Three.js Scene, Camera, Renderer, and Lighting
    useEffect(() => {
        if (!containerRef.current || !canvasRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth || 600;
        const height = 380;

        // 1. Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color("#0d0f1d");
        sceneRef.current = scene;

        // 2. Camera with ultra-near clipping plane (0.001) so zooming close never cuts off mesh geometry
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.001, 2000);
        camera.position.set(0, 2, 5);
        cameraRef.current = camera;

        // 3. Renderer (Enable logarithmicDepthBuffer to eliminate Z-fighting & mesh texture flickering)
        const renderer = new THREE.WebGLRenderer({
            canvas: canvasRef.current,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
            logarithmicDepthBuffer: true
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        rendererRef.current = renderer;

        // 4. OrbitControls (Allow full 360° orbit top-to-bottom & underneath the model)
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI - 0.01; // Allow orbiting under the asset
        controls.minPolarAngle = 0.01;
        controls.screenSpacePanning = true; // Enables smooth vertical/horizontal panning
        controlsRef.current = controls;

        // 5. Lighting Setup (Soft Hemisphere + Key Light)
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
        scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.5);
        hemiLight.position.set(0, 20, 0);
        scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(5, 10, 7);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        scene.add(dirLight);

        const fillLight = new THREE.DirectionalLight(0x6366f1, 1.0);
        fillLight.position.set(-5, -2, -5);
        scene.add(fillLight);

        // 6. Grid Helper
        const gridHelper = new THREE.GridHelper(10, 20, 0x6366f1, 0x2a2d45);
        gridHelper.position.y = -0.01;
        scene.add(gridHelper);
        gridHelperRef.current = gridHelper;

        // 7. Animation Loop
        const animate = () => {
            animFrameRef.current = requestAnimationFrame(animate);

            if (controlsRef.current) {
                controlsRef.current.autoRotate = autoRotate;
                controlsRef.current.autoRotateSpeed = 2.0;
                controlsRef.current.update();
            }

            if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
        };
        animate();

        // 8. Resize Handler
        const handleResize = () => {
            if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
            const w = containerRef.current.clientWidth;
            cameraRef.current.aspect = w / height;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, height);
        };
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
            renderer.dispose();
        };
    }, []);

    // Toggle Auto Rotate
    useEffect(() => {
        if (controlsRef.current) {
            controlsRef.current.autoRotate = autoRotate;
        }
    }, [autoRotate]);

    // Toggle Grid Visibility
    useEffect(() => {
        if (gridHelperRef.current) {
            gridHelperRef.current.visible = showGrid;
        }
    }, [showGrid]);

    // Toggle Wireframe Mode on Loaded Model
    useEffect(() => {
        if (!loadedModelRef.current) return;

        loadedModelRef.current.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach((mat: any) => { if ('wireframe' in mat) mat.wireframe = wireframe; });
                } else if (mesh.material && 'wireframe' in mesh.material) {
                    (mesh.material as any).wireframe = wireframe;
                }
            }
        });
    }, [wireframe]);

    // Load Model File when `modelUrl` changes
    useEffect(() => {
        if (!modelUrl || !sceneRef.current) return;

        setIsLoading(true);
        setLoadError(null);

        // Remove previous model if exists
        if (loadedModelRef.current) {
            sceneRef.current.remove(loadedModelRef.current);
            loadedModelRef.current = null;
        }

        // Construct loadable URL (use same-origin proxy for remote http/https URLs to bypass CORS and Cloudflare R2 header blocks)
        let targetUrl = modelUrl;
        if (modelUrl.startsWith('http://') || modelUrl.startsWith('https://')) {
            targetUrl = `/api/proxy-3d?url=${encodeURIComponent(modelUrl)}`;
        }

        const loader = new GLTFLoader();
        loader.load(
            targetUrl,
            (gltf) => {
                const model = gltf.scene;

                // Enable shadows on meshes
                model.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                sceneRef.current?.add(model);
                loadedModelRef.current = model;

                // Fit camera close & tight to visible mesh geometry
                fitCameraToModel(model);

                setIsLoading(false);
            },
            (progressEvent) => {
                // Progress tracking
            },
            (error) => {
                console.error("Three.js GLTFLoader error:", error);
                setIsLoading(false);
                setLoadError("Unable to load 3D model. Check network or file format.");
            }
        );
    }, [modelUrl]);

    // Handle File Process (Upload to R2/server)
    const processFile = async (file: File) => {
        setValidationError(null);
        setLoadError(null);

        if (!file) return;

        const nameLower = file.name.toLowerCase();
        if (!nameLower.endsWith(".glb") && !nameLower.endsWith(".gltf")) {
            setValidationError("Only .glb and .gltf files are supported.");
            return;
        }

        setFileName(file.name);
        setFileSize(file.size);

        // Immediate local blob preview
        const localBlobUrl = URL.createObjectURL(file);
        setModelUrl(localBlobUrl);

        // Background server upload
        if (onFileUpload) {
            setIsUploading(true);
            try {
                const result = await onFileUpload(file);
                if (result && result.fileUrl) {
                    if (onModelChange) {
                        onModelChange(result.fileUrl, { name: file.name, size: file.size, attachmentId: result.attachmentId });
                    }
                }
            } catch (err) {
                console.error("Upload error:", err);
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
        if (e.target) e.target.value = "";
    };

    // Drag & Drop Handlers
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

        // Internal attachment drop
        const rawData = e.dataTransfer.getData("text/plain") || e.dataTransfer.getData("application/x-3d-attachment");
        if (rawData) {
            try {
                const att = JSON.parse(rawData) as (Attachment3D & { is3DAttachment?: boolean });
                if (att.fileUrl && (att.id || att.is3DAttachment)) {
                    setModelUrl(att.fileUrl);
                    setFileName(att.fileName);
                    setFileSize(att.fileSize);
                    if (onAttachmentSelect) onAttachmentSelect(att);
                    return;
                }
            } catch {}
        }

        // Native desktop file drop
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            processFile(files[0]);
        }
    };

    const handleSelectAttachment = (att: Attachment3D) => {
        setModelUrl(att.fileUrl);
        setFileName(att.fileName);
        setFileSize(att.fileSize);
        if (onAttachmentSelect) onAttachmentSelect(att);
    };

    // Compute Bounding Box for VISIBLE meshes only (ignores hidden/dummy nodes that distort camera framing)
    const computeVisibleMeshBoundingBox = (object: THREE.Object3D): THREE.Box3 => {
        const box = new THREE.Box3();
        let hasMesh = false;

        object.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && child.visible) {
                const mesh = child as THREE.Mesh;
                mesh.geometry.computeBoundingBox();
                if (mesh.geometry.boundingBox) {
                    const meshBox = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
                    box.union(meshBox);
                    hasMesh = true;
                }
            }
        });

        if (!hasMesh) {
            box.setFromObject(object);
        }
        return box;
    };

    // Fit Camera close and centered right near the asset
    const fitCameraToModel = (model: THREE.Object3D) => {
        if (!cameraRef.current || !controlsRef.current) return;

        model.updateMatrixWorld(true);
        const box = computeVisibleMeshBoundingBox(model);
        const center = box.getCenter(new THREE.Vector3());

        // Center model geometry at origin
        model.position.x -= center.x;
        model.position.y -= center.y;
        model.position.z -= center.z;

        // Re-evaluate box after centering & sit on ground
        model.updateMatrixWorld(true);
        const updatedBox = computeVisibleMeshBoundingBox(model);
        const updatedSize = updatedBox.getSize(new THREE.Vector3());
        model.position.y -= updatedBox.min.y;

        // Bounding sphere calculation for tight, close framing
        const sphere = updatedBox.getBoundingSphere(new THREE.Sphere());
        const radius = Math.max(sphere.radius, 0.5);
        const fov = cameraRef.current.fov * (Math.PI / 180);

        // Tight camera distance (0.85 multiplier places camera right next to asset)
        let dist = (radius / Math.sin(fov / 2)) * 0.85;
        // Hard cap distance so camera NEVER gets placed far away in space
        dist = Math.min(dist, Math.max(radius * 2.5, 3.5));

        cameraRef.current.near = Math.max(0.001, radius / 500);
        cameraRef.current.far = Math.max(1000, radius * 100);
        cameraRef.current.updateProjectionMatrix();

        cameraRef.current.position.set(dist * 0.6, dist * 0.35, dist * 0.85);
        controlsRef.current.target.set(0, updatedSize.y * 0.45, 0);
        controlsRef.current.minDistance = 0.01;
        controlsRef.current.maxDistance = radius * 20;
        controlsRef.current.update();
    };

    const resetCamera = () => {
        if (loadedModelRef.current) {
            fitCameraToModel(loadedModelRef.current);
        }
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
            {/* Header Upload & Drag Drop Bar */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                    border: isDragOver ? "2px dashed var(--accent)" : "1px dashed var(--border-active)",
                    borderRadius: "var(--radius)",
                    padding: "14px 18px",
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
                <input ref={fileInputRef} type="file" accept=".glb,.gltf" onChange={handleFileChange} style={{ display: "none" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(99, 102, 241, 0.15)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <UploadCloud size={18} />
                    </div>
                    <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>
                            {isUploading ? "Uploading to Cloud..." : fileName ? `Three.js Model: ${fileName}` : "Upload 3D Model (Three.js WebGL)"}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            {isUploading ? "Please wait..." : "Drag & drop .glb/.gltf here, or click to browse"}
                        </div>
                    </div>
                </div>
                <button type="button" className="btn-ghost" style={{ fontSize: 11.5, padding: "6px 12px", pointerEvents: "none" }}>
                    {isUploading ? "Uploading..." : "Browse File"}
                </button>
            </div>

            {/* Validation Error */}
            {validationError && (
                <div style={{ padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(239, 68, 68, 0.12)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "var(--danger)", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={15} /> <span>{validationError}</span>
                </div>
            )}

            {/* Three.js WebGL Viewport Container */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                style={{
                    position: "relative",
                    width: "100%",
                    height: "380px",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                    border: isDragOver ? "2px solid var(--accent)" : "1px solid var(--border-hover)",
                    background: "#0d0f1d",
                    transition: "border 200ms ease"
                }}
            >
                {/* Drag-over overlay indicator */}
                {isDragOver && (
                    <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(99, 102, 241, 0.25)", backdropFilter: "blur(4px)", border: "2px dashed var(--accent)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#ffffff", pointerEvents: "none" }}>
                        <ArrowDownToLine size={32} style={{ color: "var(--accent)" }} />
                        <span style={{ fontSize: 14, fontWeight: 800 }}>Drop 3D Model Here to Load</span>
                    </div>
                )}

                {/* WebGL Canvas */}
                <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

                {/* Empty State / Attachment Picker */}
                {!modelUrl && !isUploading && (
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center", zIndex: 10, background: "#0d0f1d" }}>
                        <div style={{ width: 52, height: 52, borderRadius: 16, background: "rgba(99, 102, 241, 0.12)", border: "1px solid rgba(99, 102, 241, 0.3)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)" }}>
                            <Box size={26} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "#ffffff" }}>
                            Three.js WebGL 3D Viewer
                        </span>
                        <span style={{ fontSize: 11.5, color: "var(--text-muted)", maxWidth: 320, lineHeight: 1.5 }}>
                            Upload a <code>.glb</code> / <code>.gltf</code> model above, or select an existing attachment below.
                        </span>

                        {availableAttachments.length > 0 && (
                            <div style={{ width: "100%", maxWidth: 360, marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>Available 3D Attachments</span>
                                {availableAttachments.map((att) => (
                                    <button
                                        key={att.id}
                                        type="button"
                                        onClick={() => handleSelectAttachment(att)}
                                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: "var(--radius)", background: "rgba(255, 255, 255, 0.05)", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-primary)", textAlign: "left", width: "100%" }}
                                        onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.background = "rgba(99, 102, 241, 0.15)"; }}
                                        onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)"; }}
                                    >
                                        <Box size={14} style={{ color: "var(--accent)" }} />
                                        <div style={{ overflow: "hidden", flex: 1 }}>
                                            <div style={{ fontSize: 11.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.fileName}</div>
                                            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatBytes(att.fileSize)}</div>
                                        </div>
                                        <ArrowDownToLine size={14} style={{ color: "var(--accent)" }} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Loading Spinner */}
                {isLoading && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(10, 12, 22, 0.85)", backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 20 }}>
                        <div className="spinner" style={{ color: "var(--accent)" }}><RefreshCw size={28} /></div>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#ffffff" }}>Loading Three.js Scene...</span>
                    </div>
                )}

                {/* Error Overlay */}
                {loadError && !isLoading && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(15, 17, 30, 0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center", zIndex: 25 }}>
                        <AlertCircle size={36} style={{ color: "var(--danger)" }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#ffffff" }}>{loadError}</span>
                    </div>
                )}

                {/* Controls Bar (Top Right Overlay) */}
                {modelUrl && !isLoading && (
                    <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6, zIndex: 30 }}>
                        <button
                            type="button"
                            onClick={() => setAutoRotate(!autoRotate)}
                            title="Toggle Auto-Rotate"
                            style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: autoRotate ? "var(--accent)" : "rgba(15, 18, 35, 0.85)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 5 }}
                        >
                            <Sparkles size={12} /> {autoRotate ? "Rotate ON" : "Rotate OFF"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setWireframe(!wireframe)}
                            title="Toggle Wireframe Mode"
                            style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: wireframe ? "var(--accent)" : "rgba(15, 18, 35, 0.85)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 5 }}
                        >
                            <Layers size={12} /> {wireframe ? "Solid" : "Wireframe"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowGrid(!showGrid)}
                            title="Toggle Grid Floor"
                            style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: showGrid ? "rgba(15, 18, 35, 0.85)" : "rgba(255,255,255,0.1)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 5 }}
                        >
                            {showGrid ? <Eye size={12} /> : <EyeOff size={12} />} Grid
                        </button>
                        <button
                            type="button"
                            onClick={resetCamera}
                            title="Reset Camera View"
                            style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: "rgba(15, 18, 35, 0.85)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", gap: 5 }}
                        >
                            <RotateCcw size={12} /> Reset
                        </button>
                    </div>
                )}
            </div>

            {/* File Info Caption */}
            {fileName && !loadError && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", borderRadius: "var(--radius-sm)", background: "rgba(255, 255, 255, 0.03)", border: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Box size={13} style={{ color: "var(--accent)" }} />
                        <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>Three.js Engine: {fileName}</span>
                    </div>
                    {fileSize !== null && <span style={{ fontWeight: 600, color: "var(--text-muted)" }}>{formatBytes(fileSize)}</span>}
                </div>
            )}
        </div>
    );
}
