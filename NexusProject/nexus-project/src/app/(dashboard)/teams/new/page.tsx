import type { Metadata } from "next";
import { NuevoEquipo } from "@/components/organizacion/pantallas-equipo";

export const metadata: Metadata = { title: "Nuevo equipo" };

export default function Page() {
  return <NuevoEquipo />;
}
