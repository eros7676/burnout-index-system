import type { Metadata } from "next";
import { Suspense } from "react";
import { OperacionCompleta } from "@/components/auditoria/operacion";

export const metadata: Metadata = { title: "Operación" };

// The id is runtime data under Cache Components, so it is read inside Suspense.
export default function Page({
  params,
}: PageProps<"/audit/operations/[correlacionId]">) {
  return (
    <Suspense>
      {params.then(({ correlacionId }) => (
        <OperacionCompleta key={correlacionId} correlacionId={correlacionId} />
      ))}
    </Suspense>
  );
}
