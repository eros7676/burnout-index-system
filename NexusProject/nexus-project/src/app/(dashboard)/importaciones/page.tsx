import type { Metadata } from "next";
import { Importaciones } from "@/components/importaciones/importaciones";

export const metadata: Metadata = { title: "Importar datos" };

export default function Page() {
  return <Importaciones />;
}
