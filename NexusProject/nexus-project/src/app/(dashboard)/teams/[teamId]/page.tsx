import type { Metadata } from "next";
import { Suspense } from "react";
import { EquipoDetalle } from "@/components/equipos/equipo-detalle";

export const metadata: Metadata = { title: "Equipo" };

// The id is only known per request, so it is read inside a Suspense boundary.
export default function Page({ params }: PageProps<"/teams/[teamId]">) {
  return (
    <Suspense>
      {params.then(({ teamId }) => (
        <EquipoDetalle teamId={teamId} />
      ))}
    </Suspense>
  );
}
