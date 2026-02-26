"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import toast from "react-hot-toast";
import { Loader2, ArrowRight } from "lucide-react";

export default function RegisterPage() {
    const router = useRouter();
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
        try { await register(name, email, password); router.push("/dashboard"); }
        catch (err: any) { toast.error(err.response?.data?.message || "Registration failed"); }
        setLoading(false);
    };

    return (
        <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg-base)" }}>
            {/* Left branding */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "var(--bg-surface)" }}
                className="hidden lg:flex">
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                        </svg>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>ProjectFlow</span>
                </div>
                <div>
                    <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", color: "var(--accent)", marginBottom: 20 }}>Get Started</p>
                    <h1 style={{ fontSize: "3rem", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05, maxWidth: 480 }}>
                        Build.<br /><span style={{ color: "var(--text-muted)" }}>Collaborate.</span><br />Deliver.
                    </h1>
                    <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 24, maxWidth: 400, lineHeight: 1.7 }}>
                        Create your workspace and start managing projects with your team.
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    {[32, 56, 80, 48].map((h, i) => (
                        <div key={i} style={{ width: 6, height: h, borderRadius: 4, background: "var(--accent)", opacity: 0.08 + i * 0.06 }} />
                    ))}
                </div>
            </div>

            {/* Right form */}
            <div style={{ width: 480, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 56px", borderLeft: "1px solid var(--border)" }}>
                <div style={{ width: "100%", maxWidth: 380 }}>
                    <div className="lg:hidden" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 40 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                                <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                            </svg>
                        </div>
                        <span style={{ fontSize: 18, fontWeight: 700 }}>ProjectFlow</span>
                    </div>
                    <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Create your account</h2>
                    <p style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 32 }}>Start managing projects in minutes</p>
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>Full name</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
                        </div>
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
                        </div>
                        <div style={{ marginBottom: 24 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--text-secondary)" }}>Password</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 characters" />
                        </div>
                        <button type="submit" disabled={loading} className="btn-primary" style={{ width: "100%", padding: "12px 20px" }}>
                            {loading ? <Loader2 size={18} className="spinner" /> : <>Create account <ArrowRight size={16} /></>}
                        </button>
                    </form>
                    <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 32 }}>
                        Already have an account?{" "}
                        <a href="/login" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Sign in</a>
                    </p>
                </div>
            </div>
        </div>
    );
}
