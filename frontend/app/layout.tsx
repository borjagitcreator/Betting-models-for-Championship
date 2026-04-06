import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Configuración de la fuente Inter
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Championship Hub | Análisis Predictivo",
  description: "Dashboard analítico para la EFL Championship",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-[#0a0a0f] text-zinc-300 antialiased min-h-screen`}>
        {children}
      </body>
    </html>
  );
}