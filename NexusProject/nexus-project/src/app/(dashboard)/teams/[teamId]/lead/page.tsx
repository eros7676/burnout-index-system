import type { Metadata } from "next";
import { Suspense } from "react";
import { CambiarLiderEquipo } from "@/components/organizacion/pantallas-equipo";

export const metadata: Metadata = { title: "Cambiar líder" };

// The id is only known per request, so it is read inside a Suspense boundary.
export default function Page({ params }: PageProps<"/teams/[teamId]/lead">) {
  return (
    <Suspense>
      {params.then(({ teamId }) => (
        <CambiarLiderEquipo teamId={teamId} />
      ))}
    </Suspense>
  );
}
