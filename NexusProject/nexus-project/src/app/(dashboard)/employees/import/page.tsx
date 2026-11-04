import type { Metadata } from "next";
import { ImportarPersonas } from "@/components/organizacion/importar-personas";

export const metadata: Metadata = { title: "Importar personas" };

export default function Page() {
  return <ImportarPersonas />;
}
