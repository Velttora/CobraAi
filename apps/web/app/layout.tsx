import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "../components/providers/query-provider";

export const metadata: Metadata = {
  title: "Renova",
  description: "Plataforma de cobranza para cartera, WhatsApp y voz con IA."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
