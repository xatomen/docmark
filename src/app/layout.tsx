import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Docmark — Markdown to documents",
  description:
    "A local-first workspace for turning Markdown into polished documents.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
