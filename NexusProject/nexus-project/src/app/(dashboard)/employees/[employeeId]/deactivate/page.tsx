import type { Metadata } from "next";
import { Suspense } from "react";
import { BajaPersona } from "@/components/organizacion/pantallas-persona";

export const metadata: Metadata = { title: "Dar de baja" };

// The id is only known per request, so it is read inside a Suspense boundary.
export default function Page({ params }: PageProps<"/employees/[employeeId]/deactivate">) {
  return (
    <Suspense>
      {params.then(({ employeeId }) => (
        <BajaPersona employeeId={employeeId} />
      ))}
    </Suspense>
  );
}
