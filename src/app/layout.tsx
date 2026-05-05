import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prompt Library",
  description: "A curated collection of prompts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} antialiased`}>
      <head>
        <link rel="preconnect" href="https://open.feishu.cn" />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: [
              '"serviceWorker" in navigator &&',
              "window.addEventListener('load', function() {",
              "  navigator.serviceWorker.register('/sw.js').catch(function(e) {",
              "    console.log('[SW] Registration failed:', e);",
              "  });",
              "});",
            ].join(""),
          }}
        />
      </body>
    </html>
  );
}
