import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "ProjectFlow — Collaborative Project Management",
    template: "%s · ProjectFlow",
  },
  description:
    "Plan, track, and ship work together. Kanban boards, labels, checklists, attachments, and real-time workspace collaboration.",
  applicationName: "ProjectFlow",
  openGraph: {
    title: "ProjectFlow — Collaborative Project Management",
    description:
      "Kanban boards, labels, checklists, attachments, and workspace collaboration.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#030407",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme') === 'light') {
                  document.documentElement.classList.add('light-theme');
                } else {
                  document.documentElement.classList.remove('light-theme');
                }
              } catch (_) {}
            `,
          }}
        />
        <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
      </head>
      <body className={plusJakarta.className}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-hover)',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              fontWeight: 500,
            },
          }}
        />
      </body>
    </html>
  );
}
