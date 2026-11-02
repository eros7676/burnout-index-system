import type { Metadata } from "next";
import { Reglas } from "@/components/reglas/reglas";

export const metadata: Metadata = { title: "Reglas del índice" };

export default function Page() {
  return <Reglas />;
}
