import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { LenisProvider } from "@/shared/motion";
import "lenis/dist/lenis.css";
import "./globals.css";

// Tabular digits by default, so figures line up in every table (DESIGN.md › Type).
const plex = IBM_Plex_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: { default: "Sistema de Índice de Burnout", template: "%s · Sistema de Índice de Burnout" },
  description:
    "Seguimiento semanal de la carga de trabajo para RR. HH., gerencia y líderes de equipo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-AR" className={plex.variable}>
      <body>
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}
