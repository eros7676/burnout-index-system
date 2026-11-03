import type { Metadata } from "next";
import { Suspense } from "react";
import { MoverPersona } from "@/components/organizacion/pantallas-persona";

export const metadata: Metadata = { title: "Cambiar equipo o puesto" };

// The id is only known per request, so it is read inside a Suspense boundary.
export default function Page({ params }: PageProps<"/employees/[employeeId]/move">) {
  return (
    <Suspense>
      {params.then(({ employeeId }) => (
        <MoverPersona employeeId={employeeId} />
      ))}
    </Suspense>
  );
}
