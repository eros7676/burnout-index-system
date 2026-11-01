import type { Metadata } from "next";
import Importaciones from "@/components/importaciones";

export const metadata: Metadata = { title: "Nexo Laboral | Importación CSV" };
export default function Page() {
  return <Importaciones />;
}
