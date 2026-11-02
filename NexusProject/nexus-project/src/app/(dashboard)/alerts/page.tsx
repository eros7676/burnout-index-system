import type { Metadata } from "next";
import { Alertas } from "@/components/alertas/alertas";

export const metadata: Metadata = { title: "Alertas" };

export default function Page() {
  return <Alertas />;
}
