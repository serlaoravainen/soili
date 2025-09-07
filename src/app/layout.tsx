import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ClientLayout from "./ClientLayout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soili",
  description: "Työvuorohallinta",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fi" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function () {
            try {
              var key = 'soili-theme';
              var mode = localStorage.getItem(key) || 'system';
              var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
              var effective = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
              var c = document.documentElement.classList;
              c.remove('light','dark');
              c.add(effective);
            } catch (_) {}
          })();`}
        </Script>
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
