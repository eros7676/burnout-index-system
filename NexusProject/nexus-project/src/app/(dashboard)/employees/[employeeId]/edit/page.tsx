import type { Metadata } from "next";
import { Suspense } from "react";
import { EditarPersona } from "@/components/organizacion/pantallas-persona";

export const metadata: Metadata = { title: "Editar datos" };

// The id is only known per request, so it is read inside a Suspense boundary.
export default function Page({ params }: PageProps<"/employees/[employeeId]/edit">) {
  return (
    <Suspense>
      {params.then(({ employeeId }) => (
        <EditarPersona employeeId={employeeId} />
      ))}
    </Suspense>
  );
}
