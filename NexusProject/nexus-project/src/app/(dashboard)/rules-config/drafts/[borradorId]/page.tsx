import type { Metadata } from "next";
import { Suspense } from "react";
import { BorradorReglas } from "@/components/reglas/borrador";

export const metadata: Metadata = { title: "Borrador de reglas" };
// The id is only known per request, so it is read inside a Suspense boundary.
export default function Page({
  params,
}: PageProps<"/rules-config/drafts/[borradorId]">) {
  return (
    <Suspense>
      {params.then(({ borradorId }) => (
        <BorradorReglas key={borradorId} borradorId={borradorId} />
      ))}
    </Suspense>
  );
}
