import type { Metadata } from "next";
import { es } from "@diprem/core";
import "./globals.css";

export const metadata: Metadata = {
  title: es.app.nombre,
  description: es.app.lema,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
