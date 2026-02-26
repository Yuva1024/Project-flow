import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ProjectFlow — Manage Your Projects",
  description: "A Trello-style project management tool for small teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#232350',
              color: '#e8e8f0',
              border: '1px solid rgba(255,255,255,0.08)',
            },
          }}
        />
      </body>
    </html>
  );
}
