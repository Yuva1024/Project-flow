"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import toast from "react-hot-toast";
import { Loader2, ArrowRight, Mail, Lock, Sun, Moon, KeyRound, ShieldCheck, X } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export default function LoginPage() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const { login, recoverAccount, token, loadUser, isLoading: authLoading } = useAuthStore();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    // Forgot Password modal state
    const [showRecovery, setShowRecovery] = useState(false);
    const [recEmail, setRecEmail] = useState("");
    const [recCode, setRecCode] = useState("");
    const [recNewPassword, setRecNewPassword] = useState("");
    const [recLoading, setRecLoading] = useState(false);

    useEffect(() => { loadUser(); }, []);
    useEffect(() => {
        if (!authLoading && token) router.replace("/dashboard");
    }, [token, authLoading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return toast.error("All fields are required");
        setLoading(true);
        try { 
            await login(email, password); 
            router.push("/dashboard"); 
        } catch (err: any) { 
            toast.error(err.response?.data?.message || "Invalid credentials"); 
        }
        setLoading(false);
    };

    const handleRecover = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!recEmail || !recCode || !recNewPassword) return toast.error("All fields are required");
        setRecLoading(true);
        try {
            await recoverAccount(recEmail, recCode, recNewPassword);
            toast.success("Password reset successfully! You are now logged in.");
            setShowRecovery(false);
            router.push("/dashboard");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Recovery failed");
        }
        setRecLoading(false);
    };

    return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden", padding: 24 }}>
            {/* Theme Toggle Button */}
            <div style={{ position: "absolute", top: 24, right: 24, zIndex: 10 }}>
                <button onClick={toggleTheme} className="btn-ghost" style={{ padding: 8, display: "flex", alignItems: "center", justifyContent: "center" }} title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
                    {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                </button>
            </div>

            {/* Animated Ambient background */}
            <div className="glow-bg-container">
                <div className="drifting-glow-1" />
                <div className="drifting-glow-2" />
            </div>

            {/* Content card */}
            <div className="glass-panel" style={{
                position: "relative", zIndex: 1, width: "100%", maxWidth: 440,
                borderRadius: "var(--radius-xl)", padding: "48px 40px",
                boxShadow: "var(--shadow-xl)", border: "1px solid var(--border)",
            }}>
                {/* Logo */}
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                            width: 38, height: 38, borderRadius: 10,
                            background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-secondary) 100%)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            boxShadow: "0 4px 12px rgba(95, 98, 241, 0.25)"
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                            </svg>
                        </div>
                        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)" }}>ProjectFlow</span>
                    </div>
                </div>

                <div style={{ textAlign: "center", marginBottom: 32 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)", marginBottom: 8 }}>Welcome back</h2>
                    <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>Enter your details to access your workspace</p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, color: "var(--text-secondary)" }}>Email Address</label>
                        <div style={{ position: "relative" }}>
                            <Mail size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="name@company.com"
                                style={{ paddingLeft: 42 }}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, color: "var(--text-secondary)" }}>Password</label>
                        <div style={{ position: "relative" }}>
                            <Lock size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                style={{ paddingLeft: 42 }}
                                required
                            />
                        </div>
                    </div>

                    {/* Forgot Password Link */}
                    <div style={{ textAlign: "right", marginTop: -12 }}>
                        <button type="button" onClick={() => setShowRecovery(true)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, color: "var(--accent)", transition: "opacity 150ms" }}
                            onMouseOver={(e) => e.currentTarget.style.opacity = "0.8"}
                            onMouseOut={(e) => e.currentTarget.style.opacity = "1"}>
                            Forgot Password?
                        </button>
                    </div>

                    <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", padding: "12px 20px", marginTop: 8 }}>
                        {loading ? <Loader2 size={16} className="spinner" /> : <>Sign In <ArrowRight size={15} /></>}
                    </button>
                </form>

                <div style={{ textAlign: "center", marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
                    <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                        Don&apos;t have an account?{" "}
                        <a href="/register" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none", transition: "color 150ms" }}
                           onMouseOver={(e) => e.currentTarget.style.color = "var(--accent-hover)"}
                           onMouseOut={(e) => e.currentTarget.style.color = "var(--accent)"}>
                            Create one
                        </a>
                    </p>
                </div>
            </div>

            {/* Forgot Password Recovery Modal */}
            {showRecovery && (
                <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <div style={{ position: "absolute", inset: 0, background: "rgba(2, 3, 5, 0.85)", backdropFilter: "blur(12px)" }} onClick={() => setShowRecovery(false)} />
                    <div className="glass-panel" style={{
                        position: "relative", zIndex: 1, width: "100%", maxWidth: 420,
                        borderRadius: "var(--radius-xl)", padding: "40px 36px",
                        boxShadow: "var(--shadow-xl)", border: "1px solid var(--border)",
                    }}>
                        <button onClick={() => setShowRecovery(false)} style={{
                            position: "absolute", top: 16, right: 16, width: 32, height: 32, borderRadius: 8,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                            transition: "all 150ms"
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                        onMouseOut={(e) => e.currentTarget.style.color = "var(--text-muted)"}>
                            <X size={16} />
                        </button>

                        <div style={{ textAlign: "center", marginBottom: 28 }}>
                            <div style={{
                                width: 48, height: 48, borderRadius: 14, margin: "0 auto 16px",
                                background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-secondary) 100%)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                boxShadow: "0 8px 24px rgba(95, 98, 241, 0.3)"
                            }}>
                                <ShieldCheck size={24} style={{ color: "white" }} />
                            </div>
                            <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)", marginBottom: 6 }}>Reset Your Password</h3>
                            <p style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                Enter your email, the recovery code, and your new password
                            </p>
                        </div>

                        <form onSubmit={handleRecover} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, color: "var(--text-secondary)" }}>Email Address</label>
                                <div style={{ position: "relative" }}>
                                    <Mail size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                                    <input type="email" value={recEmail} onChange={(e) => setRecEmail(e.target.value)} placeholder="your@email.com" style={{ paddingLeft: 42, fontSize: 13 }} required />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, color: "var(--text-secondary)" }}>Recovery Code</label>
                                <div style={{ position: "relative" }}>
                                    <KeyRound size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                                    <input type="text" value={recCode} onChange={(e) => setRecCode(e.target.value)} placeholder="Enter recovery code" style={{ paddingLeft: 42, fontSize: 13 }} required />
                                </div>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, color: "var(--text-secondary)" }}>New Password</label>
                                <div style={{ position: "relative" }}>
                                    <Lock size={15} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                                    <input type="password" value={recNewPassword} onChange={(e) => setRecNewPassword(e.target.value)} placeholder="••••••••" style={{ paddingLeft: 42, fontSize: 13 }} required />
                                </div>
                            </div>
                            <button type="submit" disabled={recLoading} className="btn-primary" style={{ width: "100%", padding: "12px 20px", marginTop: 8 }}>
                                {recLoading ? <Loader2 size={16} className="spinner" /> : <>Reset & Sign In <ArrowRight size={15} /></>}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
