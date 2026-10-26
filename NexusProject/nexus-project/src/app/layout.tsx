import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexo Laboral | Resumen",
  description:
    "Maqueta del sistema de indicadores de posible sobrecarga laboral.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <aside role="status" style={{ padding: "12px 20px", background: "#fff3cd", color: "#4d3800", fontWeight: 600 }}>
          Maqueta visual · datos ficticios fijos. El cálculo, la importación y las
          notificaciones todavía no están conectados.
        </aside>
        {children}
      </body>
    </html>
  );
}
