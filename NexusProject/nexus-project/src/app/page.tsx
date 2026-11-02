import type { Metadata } from "next";
import { Ingreso } from "@/components/ingreso/ingreso";

export const metadata: Metadata = { title: "Ingreso" };

export default function Page() {
  return <Ingreso />;
}
