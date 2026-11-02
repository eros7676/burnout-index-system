import type { Metadata } from "next";
import { Suspense } from "react";
import { Informe } from "@/components/informe/informe";

export const metadata: Metadata = { title: "Informe" };

// The id is runtime data under Cache Components, so it is read inside Suspense.
export default function Page({
  params,
}: PageProps<"/reports/[evaluationId]">) {
  return (
    <Suspense>
      {params.then(({ evaluationId }) => (
        <Informe key={evaluationId} evaluationId={evaluationId} />
      ))}
    </Suspense>
  );
}
