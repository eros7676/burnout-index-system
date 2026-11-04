import type { Metadata } from "next";
import { Suspense } from "react";
import { DesactivarEquipoPantalla } from "@/components/organizacion/pantallas-equipo";

export const metadata: Metadata = { title: "Dar de baja" };

// The id is only known per request, so it is read inside a Suspense boundary.
export default function Page({ params }: PageProps<"/teams/[teamId]/deactivate">) {
  return (
    <Suspense>
      {params.then(({ teamId }) => (
        <DesactivarEquipoPantalla teamId={teamId} />
      ))}
    </Suspense>
  );
}
