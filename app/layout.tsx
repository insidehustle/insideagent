import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Book Automation System",
  description: "Research the market, write in your own voice, and publish a book with AI assistance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
