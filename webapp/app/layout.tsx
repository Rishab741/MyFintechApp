import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vestara Dashboard",
  description: "Institutional portfolio analytics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-surface text-white antialiased">{children}</body>
    </html>
  );
}
