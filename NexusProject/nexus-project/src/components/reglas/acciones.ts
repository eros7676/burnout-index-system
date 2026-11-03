// What each role may do with a draft in each state, and why an action is not available yet.
// The server enforces all of it again (`proteger` and the lifecycle's own checks); this only
// decides what the screen offers. Relative imports only (unit tests).
import type { BorradorReglasDTO } from "../../shared/contratos/reglas";
import { tienePermiso, type Rol } from "../../shared/permisos";

export type Accion =
  | "guardar"
  | "simular"
  | "enviar"
  | "publicar"
  | "aprobar"
  | "rechazar"
  | "descartar";

export type Disponibilidad =
  | { visible: false }
  | { visible: true; habilitada: true }
  | { visible: true; habilitada: false; razon: string };
export type VistaAcciones = Record<Accion, Disponibilidad>;

export type EntradaAcciones = {
  rol: Rol;
  usuarioId: string;
  /** The form holds changes that are not saved: every step acts on what is stored. */
  sinGuardar: boolean;
  borrador: Pick<
    BorradorReglasDTO,
    | "estado"
    | "aprobadoPor"
    | "creadoPor"
    | "simulado"
    | "simulacionVigente"
    | "requiereAprobacion"
    | "problemas"
  >;
};

const NO: Disponibilidad = { visible: false };
const SI: Disponibilidad = { visible: true, habilitada: true };
const bloqueada = (razon: string): Disponibilidad => ({
  visible: true,
  habilitada: false,
  razon,
});

export const RAZON = {
  guardar: "Guarde los cambios antes de continuar.",
  corregir: "Corrija los datos indicados antes de continuar.",
  simular: "Simule el impacto del borrador actual.",
  vencida: "Los datos cambiaron desde la simulación. Simule nuevamente.",
  vencidaParaGerencia:
    "Los datos cambiaron desde la simulación. RR. HH. debe simular nuevamente antes de aprobar.",
  otraPersona:
    "La aprobación debe ser de una persona distinta de quien creó el borrador.",
} as const;

/** Why a step on the stored content cannot run yet, in the order a person fixes it. */
function pendiente(e: EntradaAcciones, exigeSimulacion: boolean): string | null {
  if (e.sinGuardar) return RAZON.guardar;
  if (e.borrador.problemas.length > 0) return RAZON.corregir;
  if (!exigeSimulacion) return null;
  if (!e.borrador.simulado) return RAZON.simular;
  if (!e.borrador.simulacionVigente) return RAZON.vencida;
  return null;
}

const paso = (razon: string | null): Disponibilidad =>
  razon ? bloqueada(razon) : SI;

export function accionesDe(e: EntradaAcciones): VistaAcciones {
  const { estado, aprobadoPor, creadoPor, requiereAprobacion } = e.borrador;
  const abierto = estado === "BORRADOR" || estado === "EN_REVISION";
  const edita = tienePermiso(e.rol, "EDITAR_REGLAS") && abierto;
  // Content moves only while it is open and nobody approved it.
  const modificable = edita && !aprobadoPor;
  const revisa =
    tienePermiso(e.rol, "APROBAR_REGLAS") &&
    estado === "EN_REVISION" &&
    !aprobadoPor;
  const propio = creadoPor.userId === e.usuarioId;

  return {
    guardar: modificable ? SI : NO,
    simular: modificable ? paso(pendiente(e, false)) : NO,
    enviar:
      modificable && estado === "BORRADOR" && requiereAprobacion
        ? paso(pendiente(e, true))
        : NO,
    // A retroactive draft is published only once Gerencia approved it.
    publicar:
      edita && (!requiereAprobacion || !!aprobadoPor)
        ? paso(pendiente(e, true))
        : NO,
    aprobar: revisa
      ? propio
        ? bloqueada(RAZON.otraPersona)
        : e.borrador.simulado && e.borrador.simulacionVigente
          ? SI
          : bloqueada(RAZON.vencidaParaGerencia)
      : NO,
    rechazar: revisa ? (propio ? bloqueada(RAZON.otraPersona) : SI) : NO,
    descartar: edita ? SI : NO,
  };
}

/** The distinct reasons that keep a visible action from running, for one line under the buttons. */
export function razonesBloqueo(acciones: VistaAcciones): string[] {
  const razones = new Set<string>();
  for (const d of Object.values(acciones))
    if (d.visible && !d.habilitada) razones.add(d.razon);
  return [...razones];
}
