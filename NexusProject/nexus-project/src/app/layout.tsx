import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { SCRIPT_INICIAL } from "@/shared/accesibilidad";
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
  title: { default: "Nexo Laboral", template: "%s · Nexo Laboral" },
  description:
    "Seguimiento semanal de la carga de trabajo para RR. HH., gerencia y líderes de equipo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script sets the saved Accesibilidad attributes on <html> before the first paint,
    // so React finds them there on hydration (Next guide › Preventing flash before hydration).
    <html lang="es-AR" className={plex.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_INICIAL }} />
      </head>
      <body>
        <LenisProvider>{children}</LenisProvider>
      </body>
    </html>
  );
}
