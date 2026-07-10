import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { es } from "@diprem/core";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: es.app.nombre,
  description: es.app.lema,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1322" },
  ],
};

/** Aplica el tema guardado ANTES de pintar (evita el destello blanco/negro). */
const scriptTema = `try{if(localStorage.getItem("tema")==="oscuro")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body
        className={`${inter.variable} min-h-screen bg-fondo font-sans text-tinta antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
