import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DisputePilot RO · Investigații carduri",
  description:
    "AI-ul investighează. Regulile validează. Angajatul decide. Spațiu demonstrativ cu date sintetice.",
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
    <html lang="ro">
      <body className="antialiased">{children}</body>
    </html>
  );
}
