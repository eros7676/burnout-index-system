import type { Metadata } from "next";
import { Suspense } from "react";
import { Alertas } from "@/components/alertas/alertas";

export const metadata: Metadata = { title: "Alertas" };

// The filters live in the address (?equipo=, ?seguimiento=…), which is only known per request.
export default function Page() {
  return (
    <Suspense>
      <Alertas />
    </Suspense>
  );
}
