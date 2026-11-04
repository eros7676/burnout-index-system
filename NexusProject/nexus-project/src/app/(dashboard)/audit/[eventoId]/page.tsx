import type { Metadata } from "next";
import { Suspense } from "react";
import { DetalleEvento } from "@/components/auditoria/detalle-evento";

export const metadata: Metadata = { title: "Detalle del evento" };

// The id is runtime data under Cache Components, so it is read inside Suspense.
export default function Page({ params }: PageProps<"/audit/[eventoId]">) {
  return (
    <Suspense>
      {params.then(({ eventoId }) => (
        <DetalleEvento key={eventoId} eventoId={eventoId} />
      ))}
    </Suspense>
  );
}
