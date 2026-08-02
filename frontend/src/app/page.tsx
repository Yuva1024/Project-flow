"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

export default function Home() {
  const router = useRouter();
  const { token, loadUser } = useAuthStore();

  useEffect(() => {
    loadUser();
    if (token) {
      router.replace("/dashboard");
    } else {
      router.replace("/login");
    }
  }, [token]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-pulse text-lg" style={{ color: "var(--text-secondary)" }}>
        Loading...
      </div>
    </div>
  );
}
