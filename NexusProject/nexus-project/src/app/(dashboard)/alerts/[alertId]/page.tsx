import type { Metadata } from "next";
import { Suspense } from "react";
import { DetalleAlerta } from "@/components/alertas/detalle-alerta";

export const metadata: Metadata = { title: "Alerta" };

// The id is runtime data under Cache Components, so it is read inside Suspense.
export default function Page({ params }: PageProps<"/alerts/[alertId]">) {
  return (
    <Suspense>
      {params.then(({ alertId }) => (
        <DetalleAlerta key={alertId} alertId={alertId} />
      ))}
    </Suspense>
  );
}
