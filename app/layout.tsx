import type { Metadata } from "next";
import "./globals.css";
import "./frontdoor.css";
import "./incidents.css";
import "./operations.css";

export const metadata: Metadata = {
  title: "NEXT · B2C Operations Hub",
  description:
    "Customer 360, workflow-uri, documente, contracte și investigații într-un hub B2C demonstrativ cu decizie umană.",
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
