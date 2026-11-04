import type { Metadata } from "next";
import { Suspense } from "react";
import { EditarEquipo } from "@/components/organizacion/pantallas-equipo";

export const metadata: Metadata = { title: "Editar equipo" };

// The id is only known per request, so it is read inside a Suspense boundary.
export default function Page({ params }: PageProps<"/teams/[teamId]/edit">) {
  return (
    <Suspense>
      {params.then(({ teamId }) => (
        <EditarEquipo teamId={teamId} />
      ))}
    </Suspense>
  );
}
