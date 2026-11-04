import type { Metadata } from "next";
import { NuevaPersona } from "@/components/organizacion/pantallas-persona";

export const metadata: Metadata = { title: "Nueva persona" };

export default function Page() {
  return <NuevaPersona />;
}
