import type { Metadata } from "next";
import "./globals.css";
import "./frontdoor.css";
import "./incidents.css";

export const metadata: Metadata = {
  title: "Payment Incident Intelligence · B2C",
  description:
    "Patru investigatori, un orchestrator comun și decizie umană. Incidente de plată investigate cu dovezi sintetice.",
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
