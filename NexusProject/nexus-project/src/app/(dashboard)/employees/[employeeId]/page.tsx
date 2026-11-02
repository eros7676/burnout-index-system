import type { Metadata } from "next";
import { Suspense } from "react";
import { FichaPersona } from "@/components/personas/ficha-persona";

export const metadata: Metadata = { title: "Persona" };
// The id is only known per request, so it is read inside a Suspense boundary.
export default function Page({ params }: PageProps<"/employees/[employeeId]">) {
  return (
    <Suspense>
      {params.then(({ employeeId }) => (
        <FichaPersona employeeId={employeeId} />
      ))}
    </Suspense>
  );
}
