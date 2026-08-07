import type { Metadata, Viewport } from "next";
import "@porphyra/tokens/css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Porphyra",
  description: "Score every job posting before you apply. Encrypted by default.",
};

export const viewport: Viewport = {
  themeColor: "#FBF8F5", // matches --color-background — light theme only, no dark variant
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="core">
      <body>{children}</body>
    </html>
  );
}
