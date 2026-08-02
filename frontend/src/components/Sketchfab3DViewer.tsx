"use client";
import { useState, useRef } from "react";
import { Box, Maximize2, RotateCcw, Sun, Eye, Compass, Sparkles, Layers } from "lucide-react";

interface Sketchfab3DViewerProps {
    src: string;
    title?: string;
    autoRotate?: boolean;
    onToggleAutoRotate?: () => void;
    onFullscreen?: () => void;
    height?: string;
}

const ENV_PRESETS = [
    { id: "neutral", name: "Studio Neutral" },
    { id: "legacy", name: "Warm Daylight" },
    { id: "spruit_sunrise", name: "Sunrise HDRI" },
    { id: "commerce_end_of_day", name: "Sunset Glow" },
];

const getSketchfabId = (url: string) => {
    if (!url || !url.includes('sketchfab.com')) return null;
    const match = url.match(/([a-f0-9]{32})/i);
    return match ? match[1] : null;
};

export default function Sketchfab3DViewer({
    src,
    title = "3D Asset",
    autoRotate = false,
    onToggleAutoRotate,
    onFullscreen,
    height = "320px"
}: Sketchfab3DViewerProps) {
    const modelViewerRef = useRef<any>(null);
    const [environment, setEnvironment] = useState("neutral");
    const [exposure, setExposure] = useState("1.25");
    const [isSpinning, setIsSpinning] = useState(autoRotate);
    const [showLightingMenu, setShowLightingMenu] = useState(false);

    const sketchfabId = getSketchfabId(src);

    // Reset camera position
    const handleResetCamera = () => {
        if (modelViewerRef.current) {
            modelViewerRef.current.cameraOrbit = "0deg 75deg 105%";
            modelViewerRef.current.cameraTarget = "auto auto auto";
            modelViewerRef.current.jumpToGoal();
        }
    };

    const toggleSpin = () => {
        setIsSpinning(!isSpinning);
        if (onToggleAutoRotate) onToggleAutoRotate();
    };

    if (!src) {
        return (
            <div style={{
                height,
                borderRadius: "var(--radius)",
                background: "linear-gradient(145deg, #0b0d17 0%, #15182a 100%)",
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                color: "var(--text-muted)",
                padding: 24,
                textAlign: "center"
            }}>
                <Box size={36} style={{ opacity: 0.5, color: "var(--accent)" }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Sketchfab 3D Viewport</span>
                <span style={{ fontSize: 11.5, color: "var(--text-muted)", maxWidth: 320 }}>
                    Paste a <b>Sketchfab model link</b> or upload a <code>.glb</code> / <code>.gltf</code> file to inspect it in 3D.
                </span>
            </div>
        );
    }

    // If it's a Sketchfab URL, render official Sketchfab Embed
    if (sketchfabId) {
        return (
            <div style={{
                position: "relative",
                width: "100%",
                height,
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                border: "1px solid var(--border-active)",
                background: "#080911",
                boxShadow: "var(--shadow-lg)"
            }}>
                <iframe
                    title={title}
                    src={`https://sketchfab.com/models/${sketchfabId}/embed?autostart=1&ui_theme=dark&ui_controls=1&ui_infos=0&ui_inspector=1&ui_watermark=0&ui_ar=1`}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    allow="autoplay; fullscreen; execution-while-out-of-viewport; execution-while-not-rendered; web-share"
                />
            </div>
        );
    }

    // Direct .GLB / .GLTF 3D Viewer with Sketchfab UI overlay
    return (
        <div style={{
            position: "relative",
            width: "100%",
            height,
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
            border: "1px solid var(--border-active)",
            background: "radial-gradient(circle at 50% 40%, #1a1d33 0%, #0a0c16 100%)",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.6)"
        }}>
            {/* Top Toolbar (Sketchfab Header Bar) */}
            <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 42,
                padding: "0 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(10, 12, 22, 0.75)",
                backdropFilter: "blur(12px)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                zIndex: 20
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: "linear-gradient(135deg, #1caad9 0%, #0072ff 100%)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 8px rgba(0, 114, 255, 0.4)"
                    }}>
                        <Box size={13} style={{ color: "#ffffff" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.01em" }}>
                        {title}
                    </span>
                    <span style={{
                        fontSize: 9.5,
                        fontWeight: 800,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "rgba(28, 170, 217, 0.2)",
                        color: "#38bdf8",
                        border: "1px solid rgba(56, 189, 248, 0.3)",
                        textTransform: "uppercase"
                    }}>
                        3D PBR
                    </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {/* Lighting Preset Selector */}
                    <div style={{ position: "relative" }}>
                        <button
                            type="button"
                            onClick={() => setShowLightingMenu(!showLightingMenu)}
                            style={{
                                padding: "4px 9px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                background: showLightingMenu ? "var(--accent)" : "rgba(255, 255, 255, 0.08)",
                                color: "#ffffff",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 5
                            }}
                            title="Environment Lighting Settings"
                        >
                            <Sun size={12} /> Light Mode
                        </button>

                        {showLightingMenu && (
                            <div style={{
                                position: "absolute",
                                top: 34,
                                right: 0,
                                background: "#121526",
                                border: "1px solid var(--border-active)",
                                borderRadius: "var(--radius)",
                                padding: 6,
                                display: "flex",
                                flexDirection: "column",
                                gap: 4,
                                minWidth: 140,
                                zIndex: 50,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.8)"
                            }}>
                                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", padding: "4px 8px", textTransform: "uppercase" }}>Environment</span>
                                {ENV_PRESETS.map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => { setEnvironment(preset.id); setShowLightingMenu(false); }}
                                        style={{
                                            padding: "6px 10px",
                                            borderRadius: 6,
                                            fontSize: 11,
                                            fontWeight: 600,
                                            textAlign: "left",
                                            background: environment === preset.id ? "var(--accent)" : "transparent",
                                            color: "#ffffff",
                                            border: "none",
                                            cursor: "pointer"
                                        }}
                                    >
                                        {preset.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Reset Camera */}
                    <button
                        type="button"
                        onClick={handleResetCamera}
                        style={{
                            padding: 6,
                            borderRadius: 6,
                            background: "rgba(255, 255, 255, 0.08)",
                            color: "#ffffff",
                            border: "1px solid rgba(255, 255, 255, 0.12)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                        }}
                        title="Reset Camera View"
                    >
                        <RotateCcw size={13} />
                    </button>

                    {/* Fullscreen */}
                    {onFullscreen && (
                        <button
                            type="button"
                            onClick={onFullscreen}
                            style={{
                                padding: 6,
                                borderRadius: 6,
                                background: "rgba(255, 255, 255, 0.08)",
                                color: "#ffffff",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center"
                            }}
                            title="Fullscreen Viewport"
                        >
                            <Maximize2 size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Model Canvas */}
            {/* @ts-ignore */}
            <model-viewer
                ref={modelViewerRef}
                src={src}
                alt={title}
                camera-controls
                auto-rotate={isSpinning ? true : undefined}
                environment-image={environment}
                exposure={exposure}
                shadow-intensity="1.5"
                shadow-softness="0.8"
                bounds="auto"
                touch-action="pan-y"
                interaction-prompt="none"
                style={{ width: "100%", height: "100%", display: "block" }}
            />

            {/* Bottom Controls Bar (Sketchfab Navigation Footer) */}
            <div style={{
                position: "absolute",
                bottom: 10,
                left: 12,
                right: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                pointerEvents: "none",
                zIndex: 20
            }}>
                {/* Navigation Hint Pill */}
                <div style={{
                    padding: "5px 12px",
                    borderRadius: 20,
                    background: "rgba(10, 12, 22, 0.75)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "rgba(248, 250, 252, 0.8)",
                    display: "flex",
                    alignItems: "center",
                    gap: 6
                }}>
                    <Compass size={12} style={{ color: "#1caad9" }} />
                    Left-click: Orbit &bull; Right-click: Pan &bull; Scroll: Zoom
                </div>

                {/* Spin Toggle */}
                <button
                    type="button"
                    onClick={toggleSpin}
                    style={{
                        pointerEvents: "auto",
                        padding: "6px 12px",
                        borderRadius: 20,
                        fontSize: 11,
                        fontWeight: 800,
                        background: isSpinning ? "#1caad9" : "rgba(10, 12, 22, 0.75)",
                        color: "#ffffff",
                        border: isSpinning ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.12)",
                        cursor: "pointer",
                        backdropFilter: "blur(8px)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        boxShadow: isSpinning ? "0 4px 14px rgba(28, 170, 217, 0.4)" : "none"
                    }}
                >
                    <Sparkles size={12} />
                    {isSpinning ? "Auto Orbit ON" : "Auto Orbit OFF"}
                </button>
            </div>
        </div>
    );
}
