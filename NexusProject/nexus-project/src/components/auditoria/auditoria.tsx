"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useConsulta } from "@/client/use-consulta";
import {
  ENTIDADES_AUDITORIA,
  type EntidadAuditoria,
} from "@/shared/auditoria-catalogo";
import {
  AUDITORIA_LIMITES,
  type FormatoExportacion,
} from "@/shared/contratos/auditoria";
import { entero } from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import {
  Button,
  CheckboxField,
  DataTable,
  Empty,
  ErrorBox,
  Notice,
  PageHeader,
  SearchField,
  Section,
  SelectField,
  SkeletonRows,
  Toolbar,
  tabla,
} from "@/shared/ui";
import { DateField } from "@/shared/ui/date-field";
import { useSesion } from "../shell/sesion";
import { auditoriaApi, type ResultadoExportacion } from "./cliente";
import {
  cantidadEventos,
  chipsDeCodigos,
  elemento,
  enlacePersona,
  enlaceRecurso,
  etiquetaAccion,
  etiquetaMotivo,
  etiquetaOrigen,
  fechaHora,
  gruposDeAcciones,
  nombreActor,
  nombrePersona,
  rolActor,
} from "./eventos";
import {
  FILTROS_INICIALES,
  PERIODOS,
  conCambio,
  enlaceDetalle,
  filtrosDeUrl,
  filtrosParaApi,
  hayFiltros,
  rangoInvertido,
  rutaLista,
  type FiltrosUi,
} from "./filtros-url";
import { EtiquetaResultado } from "./resultado";
import s from "./auditoria.module.css";

type Aviso =
  | { tipo: "exportado"; resultado: ResultadoExportacion }
  | { tipo: "error"; mensaje: string };

const ORIGENES = [
  ["WEB", "Aplicación web"],
  ["CLI", "Línea de comandos"],
  ["SISTEMA", "Sistema"],
] as const;
const RESULTADOS = [
  ["EXITO", "Exitoso"],
  ["FALLO", "Fallido"],
  ["DENEGADO", "Denegado"],
] as const;

/** Answers "¿Quién hizo qué, cuándo y sobre qué información?": every change and consultation, newest first. */
export function Auditoria() {
  const { usuario, usuarios } = useSesion();
  const router = useRouter();
  const parametros = useSearchParams();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);

  const filtrosUrl = useMemo(() => filtrosDeUrl(parametros), [parametros]);
  // The controls show a choice at once; the URL (and the query) catch up with the transition.
  const [filtros, elegir] = useOptimistic(filtrosUrl);
  const [, transicion] = useTransition();
  const clave = rutaLista(filtrosUrl);
  const invertido = rangoInvertido(filtrosUrl);
  const aplicar = (cambio: Partial<FiltrosUi>) =>
    transicion(() => {
      const siguiente = conCambio(filtros, cambio);
      elegir(siguiente);
      router.replace(rutaLista(siguiente), { scroll: false });
    });

  // The pages go one after the other: each cursor is the position the previous page ended at.
  // The stack belongs to one set of filters and is discarded when they change.
  const [pila, setPila] = useState<{ clave: string; cursores: string[] }>({
    clave: "",
    cursores: [],
  });
  const cursores = pila.clave === clave ? pila.cursores : [];
  const cursor = cursores.at(-1);

  const consulta = useConsulta(
    (signal) =>
      auditoriaApi.listar(
        { ...filtrosParaApi(filtrosUrl, new Date()), cursor },
        signal,
      ),
    usuario && !invertido ? `auditoria:${clave}:${cursor ?? ""}` : null,
  );
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  useRowsEnter(filas, datos?.items);

  // The search box keeps what is being typed; the URL only changes on Enter or on leaving it.
  const [borrador, setBorrador] = useState(filtros.q);
  const [leido, setLeido] = useState(filtros.q);
  if (filtros.q !== leido) {
    setLeido(filtros.q);
    setBorrador(filtros.q);
  }
  const buscar = () => {
    const texto = borrador.trim();
    if (texto !== filtros.q) aplicar({ q: texto });
  };

  const [exportando, setExportando] = useState<FormatoExportacion | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const exportar = async (formato: FormatoExportacion) => {
    setExportando(formato);
    setAviso(null);
    try {
      const resultado = await auditoriaApi.exportar(
        filtrosParaApi(filtrosUrl, new Date()),
        formato,
      );
      setAviso({ tipo: "exportado", resultado });
    } catch (error) {
      setAviso({
        tipo: "error",
        mensaje:
          error instanceof Error
            ? error.message
            : "No se pudo generar el archivo.",
      });
    } finally {
      setExportando(null);
    }
  };

  const items = datos?.items ?? [];
  const chips = chipsDeCodigos(filtros, items);
  const entidades = Object.entries(ENTIDADES_AUDITORIA) as [
    EntidadAuditoria,
    string,
  ][];
  const conocido = usuarios.some((u) => u.userId === filtros.actorId);
  const hayMas = !!datos?.siguiente;
  const paginaActual = cursores.length + 1;

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Auditoría"
        contexto="Cambios, consultas y exportaciones: quién los realizó, cuándo y sobre qué datos. Esta pantalla también se registra."
        acciones={
          <>
            <Button
              disabled={exportando !== null || invertido}
              aria-busy={exportando === "csv"}
              onClick={() => exportar("csv")}
            >
              Exportar CSV
            </Button>
            <Button
              disabled={exportando !== null || invertido}
              aria-busy={exportando === "json"}
              onClick={() => exportar("json")}
            >
              Exportar JSON
            </Button>
          </>
        }
      />

      <Section
        titulo="Eventos"
        aside={
          datos && !invertido ? (
            <span className="num">
              {cantidadEventos(datos.total, datos.totalAcotado)}
            </span>
          ) : undefined
        }
      >
        <Toolbar>
          <SelectField
            etiqueta="Período"
            value={filtros.periodo}
            onChange={(e) =>
              aplicar({ periodo: e.target.value as FiltrosUi["periodo"] })
            }
          >
            {Object.entries(PERIODOS).map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
            {filtros.periodo === "personalizado" && (
              <option value="personalizado" disabled>
                Fechas elegidas
              </option>
            )}
          </SelectField>
          <DateField
            etiqueta="Desde"
            value={filtros.desde}
            max={filtros.hasta || undefined}
            onChange={(e) => aplicar({ desde: e.target.value })}
          />
          <DateField
            etiqueta="Hasta"
            value={filtros.hasta}
            min={filtros.desde || undefined}
            onChange={(e) => aplicar({ hasta: e.target.value })}
          />
          <SelectField
            etiqueta="Tipo de recurso"
            value={filtros.entidad}
            onChange={(e) =>
              aplicar({ entidad: e.target.value as FiltrosUi["entidad"] })
            }
          >
            <option value="">Todos</option>
            {entidades.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </SelectField>
          <SelectField
            etiqueta="Acción"
            value={filtros.accion}
            onChange={(e) => aplicar({ accion: e.target.value })}
          >
            <option value="">Todas</option>
            {gruposDeAcciones(filtros.entidad).map((grupo) => (
              <optgroup key={grupo.entidad} label={grupo.etiqueta}>
                {grupo.acciones.map((a) => (
                  <option key={a.accion} value={a.accion}>
                    {a.etiqueta}
                  </option>
                ))}
              </optgroup>
            ))}
          </SelectField>
          <SelectField
            etiqueta="Usuario"
            value={filtros.actorId}
            onChange={(e) => aplicar({ actorId: e.target.value })}
          >
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.nombre}
              </option>
            ))}
            {filtros.actorId && !conocido && (
              <option value={filtros.actorId}>Usuario seleccionado</option>
            )}
          </SelectField>
          <SelectField
            etiqueta="Resultado"
            value={filtros.resultado}
            onChange={(e) =>
              aplicar({ resultado: e.target.value as FiltrosUi["resultado"] })
            }
          >
            <option value="">Todos</option>
            {RESULTADOS.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </SelectField>
          <SelectField
            etiqueta="Origen"
            value={filtros.origen}
            onChange={(e) =>
              aplicar({ origen: e.target.value as FiltrosUi["origen"] })
            }
          >
            <option value="">Todos</option>
            {ORIGENES.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </SelectField>
          <SearchField
            etiqueta="Buscar por código"
            title="Código exacto de un recurso, una persona, una operación o una solicitud"
            maxLength={64}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") buscar();
            }}
            onBlur={buscar}
          />
          <div className={s.consultas}>
            <CheckboxField
              etiqueta={
                datos && datos.consultasOcultas > 0 && !filtros.consultas
                  ? `Incluir consultas (${entero(datos.consultasOcultas)} ocultas)`
                  : "Incluir consultas"
              }
              checked={filtros.consultas}
              onChange={(e) => aplicar({ consultas: e.target.checked })}
            />
          </div>
          {hayFiltros(filtros) && (
            <Button
              variante="quiet"
              onClick={() => {
                setBorrador("");
                aplicar(FILTROS_INICIALES);
              }}
            >
              Quitar filtros
            </Button>
          )}
        </Toolbar>

        {chips.length > 0 && (
          <ul className={s.chips} aria-label="Filtros por selección">
            {chips.map((chip) => (
              <li key={chip.clave} className={s.chip}>
                {chip.texto}
                <button
                  type="button"
                  className={s.quitar}
                  aria-label={`Quitar el filtro: ${chip.texto}`}
                  onClick={() => aplicar({ [chip.clave]: "" })}
                >
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        {(aviso || datos?.totalAcotado) && (
          <div className={s.avisos}>
            {aviso?.tipo === "exportado" && (
              <Notice tono={aviso.resultado.truncado ? "aviso" : "exito"}>
                {aviso.resultado.truncado
                  ? `El archivo ${aviso.resultado.nombre} contiene los primeros ${entero(aviso.resultado.filas)} eventos de los que coinciden. Acote el período para exportar el resto.`
                  : `Archivo ${aviso.resultado.nombre} generado con ${cantidadEventos(aviso.resultado.filas, false)}.`}
              </Notice>
            )}
            {aviso?.tipo === "error" && <ErrorBox mensaje={aviso.mensaje} />}
            {datos?.totalAcotado && (
              <Notice tono="info">
                Hay más de {entero(datos.total)} eventos con estos filtros. Acote
                el período para ver el total.
              </Notice>
            )}
          </div>
        )}

        <div ref={caja}>
          {invertido ? (
            <Notice tono="aviso">
              La fecha desde es posterior a la fecha hasta.
            </Notice>
          ) : consulta.estado === "error" ? (
            <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
          ) : !datos ? (
            <SkeletonRows filas={6} />
          ) : items.length === 0 ? (
            hayFiltros(filtros) ? (
              <Empty titulo="No hay eventos con estos filtros">
                Amplíe el período o quite alguno de los filtros.
              </Empty>
            ) : (
              <Empty titulo="Todavía no hay eventos">
                Cada importación, cambio de reglas o consulta de datos
                personales queda registrado aquí.
              </Empty>
            )
          ) : (
            <DataTable etiqueta="Eventos de auditoría">
              <thead>
                <tr>
                  <th scope="col">Fecha y hora</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Acción</th>
                  <th scope="col">Recurso</th>
                  <th scope="col">Persona</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody ref={filas}>
                {items.map((evento) => {
                  const recurso = elemento(evento);
                  const enlace = enlaceRecurso(evento);
                  const persona = enlacePersona(evento);
                  const rol = rolActor(evento, usuarios);
                  return (
                    <tr key={evento.eventoId}>
                      <th scope="row">
                        <Link
                          className={tabla.rowLink}
                          href={enlaceDetalle(evento.eventoId, filtros)}
                        >
                          <time dateTime={evento.createdAt}>
                            {fechaHora(evento.createdAt)}
                          </time>
                        </Link>
                      </th>
                      <td>
                        {nombreActor(evento, usuarios)}
                        <span className={tabla.sub}>
                          {rol ?? etiquetaOrigen(evento.origen)}
                        </span>
                      </td>
                      <td>{etiquetaAccion(evento)}</td>
                      <td>
                        {recurso.tipo}
                        {(enlace || recurso.nombre) && (
                          <span className={tabla.sub}>
                            {enlace ? (
                              <Link className={tabla.rowLink} href={enlace}>
                                {recurso.nombre ?? "Abrir recurso"}
                              </Link>
                            ) : (
                              recurso.nombre
                            )}
                          </span>
                        )}
                      </td>
                      <td className={s.persona}>
                        {persona ? (
                          <Link className={tabla.rowLink} href={persona}>
                            {nombrePersona(evento)}
                          </Link>
                        ) : (
                          <>
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">Sin persona</span>
                          </>
                        )}
                      </td>
                      <td>
                        <EtiquetaResultado resultado={evento.resultado} />
                        {evento.motivo && evento.resultado !== "EXITO" && (
                          <span className={tabla.sub}>
                            {etiquetaMotivo(evento.motivo)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </div>

        <div className={s.pie}>
          <p className={s.nota}>
            Los eventos se conservan {AUDITORIA_LIMITES.retencionMeses} meses.
            Las consultas y las exportaciones de esta pantalla también quedan
            registradas.
          </p>
          {datos && (cursores.length > 0 || hayMas) && (
            <nav className={s.paginas} aria-label="Páginas de eventos">
              <Button
                disabled={cursores.length === 0}
                onClick={() =>
                  setPila({ clave, cursores: cursores.slice(0, -1) })
                }
              >
                Anterior
              </Button>
              <span className={`${s.posicion} num`} aria-live="polite">
                Página {paginaActual}
              </span>
              <Button
                disabled={!hayMas}
                onClick={() =>
                  datos.siguiente &&
                  setPila({ clave, cursores: [...cursores, datos.siguiente] })
                }
              >
                Siguiente
              </Button>
            </nav>
          )}
        </div>
      </Section>
    </div>
  );
}
