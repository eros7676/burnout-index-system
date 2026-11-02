import type { Metadata } from "next";
import { MisDatos } from "@/components/mis-datos/mis-datos";

export const metadata: Metadata = { title: "Mis datos" };

export default function Page() {
  return <MisDatos />;
}
