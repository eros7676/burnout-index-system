import type { Metadata } from "next";
import { Suspense } from "react";
import { SemanaTareas } from "@/components/tareas/semana-tareas";

export const metadata: Metadata = { title: "Tareas de la semana" };

// The ids are runtime data and the view reads its filters from the URL, so both sit inside Suspense.
export default function Page({
  params,
}: PageProps<"/employees/[employeeId]/weeks/[periodStart]">) {
  return (
    <Suspense>
      {params.then(({ employeeId, periodStart }) => (
        <SemanaTareas
          key={`${employeeId}/${periodStart}`}
          employeeId={employeeId}
          periodStart={periodStart}
        />
      ))}
    </Suspense>
  );
}
