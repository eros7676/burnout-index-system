import {
  ESTADO_SEGUIMIENTO,
  type ResumenSeguimiento,
} from "@/shared/contratos/seguimiento";
import { tabla } from "@/shared/ui";
import { StatusTag } from "@/shared/ui/status-tag";
import { TONO_ESTADO, fecha } from "./textos";
import s from "./seguimiento.module.css";

/** The state of a follow-up as a tag; a due date that passed adds «Vencido». */
export function EstadoSeguimientoTag({
  estado,
  vencido,
}: Pick<ResumenSeguimiento, "estado" | "vencido">) {
  return (
    <span className={s.tonos}>
      <StatusTag tono={TONO_ESTADO[estado]}>{ESTADO_SEGUIMIENTO[estado]}</StatusTag>
      {vencido && <StatusTag tono="incidencia">Vencido</StatusTag>}
    </span>
  );
}

/** What a list row says of the follow-up: its state, who has it and when it is due. */
export function ResumenSeguimientoCelda({
  resumen,
  usuarioId,
}: {
  resumen: ResumenSeguimiento | null;
  usuarioId?: string;
}) {
  if (!resumen) return <span className={tabla.sub}>Sin seguimiento</span>;
  const responsable =
    resumen.asignadoA.userId === usuarioId
      ? `${resumen.asignadoA.nombre} (usted)`
      : resumen.asignadoA.nombre;
  return (
    <span className={s.resumen}>
      <EstadoSeguimientoTag estado={resumen.estado} vencido={resumen.vencido} />
      <span className={tabla.sub}>
        {responsable}
        {resumen.vence && resumen.estado !== "CERRADO"
          ? `, vence el ${fecha(resumen.vence)}`
          : ""}
      </span>
    </span>
  );
}
