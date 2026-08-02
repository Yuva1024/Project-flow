"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import toast from "react-hot-toast";
import { Loader2, ArrowRight, Mail, Lock, User, Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export default function RegisterPage() {
    const router = useRouter();
    const { theme, toggleTheme } = useTheme();
    const { register, token, loadUser, isLoading: authLoading } = useAuthStore();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => { loadUser(); }, []);
    useEffect(() => {
        if (!authLoading && token) router.replace("/dashboard");
    }, [token, authLoading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !email || !password) return toast.error("All fields are required");
        if (password.length < 6) return toast.error("Password must be at least 6 characters");
        setLoading(true);
        try { 
            await register(name, email, password); 
            router.push("/dashboard"); 
        } catch (err: any) { 
            toast.error(err.response?.data?.message || "Registration failed"); 
        }
        setLoading(false);
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
            <div className="glass-panel auth-card-padding" style={{
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

                <div style={{ marginBottom: 32, textAlign: "center" }}>
                    <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-primary)", marginBottom: 8 }}>Get started</h2>
                    <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>Create your account to start shipping faster</p>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div>
                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, color: "var(--text-secondary)" }}>Full Name</label>
                        <div style={{ position: "relative" }}>
                            <User size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Jane Smith"
                                style={{ paddingLeft: 42 }}
                                required
                            />
                        </div>
                    </div>

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
                                placeholder="Min. 6 characters"
                                style={{ paddingLeft: 42 }}
                                required
                            />
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", padding: "12px 20px", marginTop: 8 }}>
                        {loading ? <Loader2 size={16} className="spinner" /> : <>Create Account <ArrowRight size={15} /></>}
                    </button>
                </form>

                <div style={{ textAlign: "center", marginTop: 32, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
                    <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>
                        Already have an account?{" "}
                        <a href="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none", transition: "color 150ms" }}
                           onMouseOver={(e) => e.currentTarget.style.color = "var(--accent-hover)"}
                           onMouseOut={(e) => e.currentTarget.style.color = "var(--accent)"}>
                            Sign in
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
