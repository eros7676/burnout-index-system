import type { Metadata } from "next";
import { Resumen } from "@/components/resumen/resumen";

export const metadata: Metadata = { title: "Resumen" };

export default function Page() {
  return <Resumen />;
}
