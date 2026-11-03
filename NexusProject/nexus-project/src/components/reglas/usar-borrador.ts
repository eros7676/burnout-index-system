"use client";
import { useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import type { BorradorReglasDTO } from "@/shared/contratos/reglas";
import { plural } from "./parametros";
import { ErrorReglas, reglasApi } from "./api";
import type { Accion } from "./acciones";
import type { Dialogo } from "./dialogos";
import {
  erroresDeServidor,
  formularioDe,
  leerFormulario,
  sinGuardar,
  type CampoFormulario,
  type ErroresFormulario,
  type Formulario,
} from "./formulario";

/** The server refused because the draft is not what the page shows any more: only reloading helps. */
export const DESACTUALIZADO = new Set([
  "CONFLICTO_EDICION",
  "ESTADO_INCOMPATIBLE",
  "SIMULACION_DESACTUALIZADA",
  "APROBACION_REQUERIDA",
  "NO_ENCONTRADO",
]);
const SIN_ERRORES = { porCampo: {} as Record<string, string>, generales: [] as string[] };
const sinClaves = <T extends Record<string, string | undefined>>(
  datos: T,
  claves: readonly string[],
): T =>
  Object.fromEntries(
    Object.entries(datos).filter(([k]) => !claves.includes(k)),
  ) as T;

/**
 * State and steps of one draft. Every step quotes the fingerprint it read and answers with the
 * whole draft, which replaces what is shown; a refusal keeps what the person typed.
 */
export function useBorrador(borradorId: string, habilitado: boolean) {
  const consulta = useConsulta(
    (signal) => reglasApi.obtener(borradorId, signal),
    habilitado ? `borrador:${borradorId}` : null,
  );
  const [recibido, setRecibido] = useState<BorradorReglasDTO | null>(null);
  const datos =
    recibido?.borradorId === borradorId
      ? recibido
      : consulta.estado === "listo"
        ? consulta.datos
        : null;

  // The form restarts from the stored content whenever the stored content changes.
  const [edicion, setEdicion] = useState<{ huella: string; valores: Formulario } | null>(null);
  if (datos && edicion?.huella !== datos.huella)
    setEdicion({ huella: datos.huella, valores: formularioDe(datos.propuesta, datos.motivo) });
  const valores = edicion && datos?.huella === edicion.huella ? edicion.valores : null;
  const pendiente = !!(datos && valores && sinGuardar(valores, datos.propuesta, datos.motivo));

  const [locales, setLocales] = useState<ErroresFormulario>({});
  const [servidor, setServidor] = useState(SIN_ERRORES);
  const [exito, setExito] = useState<string | null>(null);
  const [fallo, setFallo] = useState<ErrorReglas | null>(null);
  const [ocupado, setOcupado] = useState<Accion | null>(null);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [errorDialogo, setErrorDialogo] = useState<string | null>(null);
  const [justificacion, setJustificacion] = useState("");

  /** Counts refused saves: the screen moves focus to the first field to fix each time. */
  const [intentos, setIntentos] = useState(0);

  const recargar = () => {
    setRecibido(null);
    setFallo(null);
    setExito(null);
    setDialogo(null);
    consulta.reintentar();
  };
  const aplicar = (dto: BorradorReglasDTO, mensaje: string) => {
    setRecibido(dto);
    setLocales({});
    setServidor(SIN_ERRORES);
    setExito(mensaje);
    setDialogo(null);
    setJustificacion("");
  };
  const fallar = (error: unknown, enDialogo: boolean) => {
    const e =
      error instanceof ErrorReglas
        ? error
        : new ErrorReglas(0, "ERROR", "No se pudo completar la operación. Inténtelo nuevamente.");
    if (e.detalles.some((d) => d.campo === "justificacion"))
      setErrorDialogo(e.detalles.map((d) => d.detalle).join(" "));
    else if (e.codigo === "CONFIGURACION_INVALIDA" && e.detalles.length > 0) {
      setServidor(erroresDeServidor(e.detalles));
      setDialogo(null);
      setFallo(e);
      setIntentos((n) => n + 1);
    } else if (enDialogo && !DESACTUALIZADO.has(e.codigo)) setErrorDialogo(e.message);
    else {
      setDialogo(null);
      setFallo(e);
    }
  };
  async function ejecutar<T>(
    accion: Accion,
    tarea: () => Promise<T>,
    alExito: (resultado: T) => void,
    enDialogo = false,
  ) {
    setOcupado(accion);
    setFallo(null);
    setExito(null);
    setErrorDialogo(null);
    try {
      alExito(await tarea());
    } catch (error) {
      fallar(error, enDialogo);
    } finally {
      setOcupado(null);
    }
  }

  const guardar = () => {
    if (!datos || !valores) return;
    const lectura = leerFormulario(valores);
    setLocales(lectura.errores);
    setFallo(null);
    setExito(null);
    if (!lectura.propuesta) {
      setServidor(SIN_ERRORES);
      setIntentos((n) => n + 1);
      return;
    }
    const { propuesta, motivo } = lectura;
    void ejecutar(
      "guardar",
      () => reglasApi.guardar(datos.borradorId, { huella: datos.huella, motivo, propuesta }),
      (dto) => aplicar(dto, "Se guardaron los cambios del borrador."),
    );
  };
  const cambiar = (campo: CampoFormulario, texto: string) => {
    setEdicion((e) => (e ? { ...e, valores: { ...e.valores, [campo]: texto } } : e));
    const claves = campo.startsWith("weights.") ? [campo, "weights"] : [campo];
    setLocales((e) => sinClaves(e, claves));
    setServidor((e) => ({ ...e, porCampo: sinClaves(e.porCampo, claves) }));
  };

  /** Steps that run from the page's buttons; the irreversible ones ask first (`confirmar`). */
  const simular = () => {
    if (datos)
      void ejecutar(
        "simular",
        () => reglasApi.simular(datos.borradorId, datos.huella),
        (dto) => aplicar(dto, "Se calculó el impacto del borrador con los datos actuales."),
      );
  };
  const enviar = () => {
    if (datos)
      void ejecutar(
        "enviar",
        () => reglasApi.enviar(datos.borradorId, datos.huella),
        (dto) =>
          aplicar(dto, "El borrador se envió a revisión. Gerencia debe aprobarlo antes de publicar."),
      );
  };
  const confirmar = (cual: Dialogo) => {
    if (!datos) return;
    const { borradorId: id, huella } = datos;
    if (cual === "publicar")
      void ejecutar(
        "publicar",
        () => reglasApi.publicar(id, huella),
        (r) =>
          aplicar(
            r.borrador,
            `Se publicó la versión ${r.version.version}. ${
              r.version.semanas > 0
                ? `Se recalculan ${plural(r.version.semanas, "semana", "semanas")}.`
                : "No hay semanas por recalcular."
            }`,
          ),
        true,
      );
    if (cual === "aprobar")
      void ejecutar(
        "aprobar",
        () => reglasApi.aprobar(id, huella),
        (dto) => aplicar(dto, "Se aprobó el borrador. RR. HH. puede publicar la versión."),
        true,
      );
    if (cual === "rechazar")
      void ejecutar(
        "rechazar",
        () => reglasApi.rechazar(id, huella, justificacion.trim()),
        (dto) =>
          aplicar(dto, "Se rechazó el borrador. Volvió a RR. HH. con la justificación indicada."),
        true,
      );
    if (cual === "descartar")
      void ejecutar(
        "descartar",
        () => reglasApi.descartar(id, huella),
        (dto) => aplicar(dto, "Se descartó el borrador."),
        true,
      );
  };

  return {
    consulta,
    datos,
    valores,
    pendiente,
    errores: { ...servidor.porCampo, ...locales } as Record<string, string>,
    generales: servidor.generales,
    exito,
    fallo,
    ocupado,
    dialogo,
    errorDialogo,
    justificacion,
    intentos,
    setDialogo,
    setJustificacion,
    cancelarDialogo: () => {
      setDialogo(null);
      setErrorDialogo(null);
    },
    recargar,
    cambiar,
    guardar,
    simular,
    enviar,
    confirmar,
  };
}

/** What a screen needs to draw one draft: the state and the steps `useBorrador` offers. */
export type EstadoBorrador = ReturnType<typeof useBorrador>;
