import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
