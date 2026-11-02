import type { Metadata } from "next";
import { Equipos } from "@/components/equipos/equipos";

export const metadata: Metadata = { title: "Equipos" };

export default function Page() {
  return <Equipos />;
}
