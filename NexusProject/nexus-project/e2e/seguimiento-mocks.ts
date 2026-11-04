// Mocked server of an alert's page and its follow-up case, for the browser specs of the alert screens.
// It keeps the rules the screen relies on (a due date for «En curso», measures done before closing by
// them) and answers refusals in the API's error shape, so the forms' messages can be checked.
import type { Page } from "@playwright/test";
import { USUARIOS_DEMO } from "../src/server/http/permisos-demo";
import type { AlertaListada } from "../src/shared/contracts";
import type {
  CasoSeguimientoDTO,
  PermisosSeguimiento,
  ResumenSeguimiento,
  SeguimientoAlertaDTO,
  UsuarioReferencia,
} from "../src/shared/contratos/seguimiento";
import { alertaListadaMock } from "../src/shared/mocks";
import type { UsuarioDemo } from "./demo";

export const ALERTA_ID = alertaListadaMock.alertId;
export const RUTA_ALERTA = `/alerts/${ALERTA_ID}`;
const AHORA = "2026-10-19T12:00:00.000Z";

export const referencia = (userId: string): UsuarioReferencia => ({
  userId,
  nombre: USUARIOS_DEMO.find((u) => u.userId === userId)!.nombre,
});
/** Who may own a case on a technician's alert: RR. HH. and the Team Lead of the team. */
export const ASIGNABLES = ["demo-rrhh", "demo-tl-01"].map(referencia);

export const PERMISOS_RRHH: PermisosSeguimiento = {
  abrir: true,
  gestionar: true,
  anotar: true,
  reasignar: true,
};

/** An alert with no follow-up, as RR. HH. sees it. */
export const seguimientoSinCaso: SeguimientoAlertaDTO = {
  alertId: ALERTA_ID,
  caso: null,
  relacion: null,
  permisos: PERMISOS_RRHH,
  asignables: ASIGNABLES,
  asignadoPorDefecto: "demo-tl-01",
};

export const resumenDe = (
  caso: CasoSeguimientoDTO | null,
): ResumenSeguimiento | null =>
  caso && {
    casoId: caso.casoId,
    estado: caso.estado,
    asignadoA: caso.asignadoA,
    vence: caso.vence,
    vencido: caso.vencido,
  };

export type ServidorSeguimiento = {
  caso: CasoSeguimientoDTO | null;
  permisos: PermisosSeguimiento;
  /** false hides the internal notes, as for a viewer who is neither RR. HH. nor the owner. */
  notasVisibles: boolean;
  /** Every write received, in order. */
  escrituras: { metodo: string; ruta: string; cuerpo: unknown }[];
};

const rechazo = (campo: string, codigo: string, detalle: string) => ({
  status: 422,
  json: {
    error: {
      codigo: "VALIDACION_INVALIDA",
      mensaje: "Hay datos que corregir.",
      detalles: [{ fila: null, campo, codigo, detalle }],
    },
  },
});

/**
 * Answers the alert's page (`GET /api/alertas/{id}`) and its follow-up routes for one session.
 * Returns the server's state, which a spec can read or change between steps.
 */
export async function servidorSeguimiento(
  page: Page,
  usuario: UsuarioDemo,
  {
    permisos = PERMISOS_RRHH,
    notasVisibles = true,
    alerta = {},
    caso = null,
  }: {
    permisos?: PermisosSeguimiento;
    notasVisibles?: boolean;
    alerta?: Partial<AlertaListada>;
    caso?: CasoSeguimientoDTO | null;
  } = {},
): Promise<ServidorSeguimiento> {
  const estado: ServidorSeguimiento = {
    caso,
    permisos,
    notasVisibles,
    escrituras: [],
  };
  let contador = 0;
  const dto = (): SeguimientoAlertaDTO => ({
    alertId: ALERTA_ID,
    caso: estado.caso && {
      ...estado.caso,
      notas: estado.notasVisibles ? estado.caso.notas : null,
    },
    relacion: estado.caso ? "ORIGEN" : null,
    permisos: { ...estado.permisos, abrir: estado.permisos.abrir && !estado.caso },
    asignables: ASIGNABLES,
    asignadoPorDefecto: "demo-tl-01",
  });

  await page.route(
    (url) => url.pathname === `/api/alertas/${ALERTA_ID}`,
    (route) =>
      route.fulfill({
        json: {
          ...alertaListadaMock,
          ...alerta,
          seguimiento: resumenDe(estado.caso),
        },
      }),
  );
  await page.route(
    (url) => url.pathname.startsWith(`/api/alertas/${ALERTA_ID}/seguimiento`),
    (route) => {
      const request = route.request();
      const ruta = new URL(request.url()).pathname.split("/seguimiento")[1];
      const metodo = request.method();
      const cuerpo = metodo === "GET" ? undefined : request.postDataJSON();
      if (metodo !== "GET") estado.escrituras.push({ metodo, ruta, cuerpo });
      const caso = estado.caso;
      if (metodo === "GET") return route.fulfill({ json: dto() });

      if (ruta === "" && metodo === "POST") {
        estado.caso = {
          casoId: "mock-caso-1",
          employeeId: alertaListadaMock.employeeId,
          alertaOrigenId: ALERTA_ID,
          estado: "NUEVO",
          asignadoA: referencia(cuerpo.asignadoA ?? "demo-tl-01"),
          vence: null,
          vencido: false,
          motivoCierre: null,
          abiertoPor: referencia(usuario),
          cerradoPor: null,
          createdAt: AHORA,
          cerradoAt: null,
          medidas: [],
          notas: [],
          totalNotas: 0,
        };
        return route.fulfill({ json: dto() });
      }
      if (!caso) return route.fulfill(rechazo("estado", "SIN_CASO", "No hay seguimiento."));

      if (ruta === "" && metodo === "PATCH") {
        const vence = cuerpo.vence !== undefined ? cuerpo.vence : caso.vence;
        if ((cuerpo.estado ?? caso.estado) === "EN_CURSO" && !vence)
          return route.fulfill(
            rechazo(
              "vence",
              "VENCE_OBLIGATORIO",
              "Un seguimiento en curso requiere fecha de vencimiento.",
            ),
          );
        estado.caso = {
          ...caso,
          estado: cuerpo.estado ?? caso.estado,
          asignadoA: cuerpo.asignadoA ? referencia(cuerpo.asignadoA) : caso.asignadoA,
          vence,
        };
        return route.fulfill({ json: dto() });
      }
      if (ruta === "/notas") {
        estado.caso = {
          ...caso,
          notas: [
            ...(caso.notas ?? []),
            {
              notaId: `mock-nota-${++contador}`,
              autor: referencia(usuario),
              texto: cuerpo.texto,
              createdAt: AHORA,
              esCierre: false,
            },
          ],
          totalNotas: caso.totalNotas + 1,
        };
        return route.fulfill({ json: dto() });
      }
      if (ruta === "/medidas" && metodo === "POST") {
        estado.caso = {
          ...caso,
          medidas: [
            ...caso.medidas,
            {
              medidaId: `mock-medida-${++contador}`,
              tipo: cuerpo.tipo,
              factor: cuerpo.factor ?? null,
              responsable: referencia(cuerpo.responsableId),
              vence: cuerpo.vence ?? null,
              hecha: false,
              createdAt: AHORA,
            },
          ],
        };
        return route.fulfill({ json: dto() });
      }
      if (ruta === "/medidas" && metodo === "PATCH") {
        estado.caso = {
          ...caso,
          medidas: caso.medidas.map((m) =>
            m.medidaId === cuerpo.medidaId ? { ...m, hecha: cuerpo.hecha } : m,
          ),
        };
        return route.fulfill({ json: dto() });
      }
      if (ruta === "/cierre") {
        if (
          cuerpo.motivoCierre === "MEDIDAS_IMPLEMENTADAS" &&
          (!caso.medidas.length || caso.medidas.some((m) => !m.hecha))
        )
          return route.fulfill(
            rechazo(
              "motivoCierre",
              "MEDIDAS_PENDIENTES",
              "Para cerrar por medidas implementadas, registre al menos una medida y marque todas como hechas.",
            ),
          );
        estado.caso = {
          ...caso,
          estado: "CERRADO",
          motivoCierre: cuerpo.motivoCierre,
          cerradoPor: referencia(usuario),
          cerradoAt: AHORA,
          notas: [
            ...(caso.notas ?? []),
            {
              notaId: `mock-nota-${++contador}`,
              autor: referencia(usuario),
              texto: cuerpo.justificacion,
              createdAt: AHORA,
              esCierre: true,
            },
          ],
          totalNotas: caso.totalNotas + 1,
        };
        return route.fulfill({ json: dto() });
      }
      return route.fulfill({ status: 404, json: { error: { codigo: "NO_ENCONTRADO", mensaje: "Ruta inexistente.", detalles: [] } } });
    },
  );
  return estado;
}
