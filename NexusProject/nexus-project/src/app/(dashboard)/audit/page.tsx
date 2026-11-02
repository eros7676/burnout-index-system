import type { Metadata } from "next";
import { Auditoria } from "@/components/auditoria/auditoria";

export const metadata: Metadata = { title: "Auditoría" };

export default function Page() {
  return <Auditoria />;
}
