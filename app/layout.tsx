import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Snap2Sell｜商品工作台",
  description: "從商品照片到個人化蝦皮商品頁。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
