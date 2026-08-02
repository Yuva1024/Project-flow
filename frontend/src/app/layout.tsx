import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "react-hot-toast";

const plusJakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ProjectFlow — Manage Your Projects",
  description: "A collaborative, high-density project management workspace",
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
