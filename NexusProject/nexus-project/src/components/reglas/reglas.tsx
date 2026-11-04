"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import type { ConfiguracionIndice } from "@/shared/contracts";
import type {
  EstadoBorradorReglas,
  VersionReglasDTO,
} from "@/shared/contratos/reglas";
import { FACTOR, momentoConAnio, valorFactor } from "@/shared/formato";
import { useArrival, usePageEnter, useRowsEnter } from "@/shared/motion";
import { tienePermiso } from "@/shared/permisos";
import {
  Button,
  DataTable,
  Empty,
  ErrorBox,
  LevelTag,
  PageHeader,
  Section,
  SelectField,
  SkeletonRows,
  Toolbar,
  tabla,
} from "@/shared/ui";
import { Pagination } from "@/shared/ui/pagination";
import { StatusTag } from "@/shared/ui/status-tag";
import { useSesion } from "../shell/sesion";
import { ErrorReglas, reglasApi } from "./api";
import {
  ESTADO_BORRADOR,
  ESTADO_VERSION,
  FACTORES,
  MIDE,
  TONO_BORRADOR,
  TONO_VERSION,
  fecha,
  porcentaje,
} from "./parametros";
import s from "./reglas.module.css";

const POR_PAGINA = 20;

/**
 * Answers "¿Cómo se calcula el índice?" from the rules in force, lists every version with its
 * state, and opens the drafts that change them. The index is also explained by what it is not.
 */
export function Reglas() {
  const { usuario } = useSesion();
  const rol = usuario?.rol;
  const edita = !!rol && tienePermiso(rol, "EDITAR_REGLAS");
  const gestiona = edita || (!!rol && tienePermiso(rol, "APROBAR_REGLAS"));
  const router = useRouter();
  const pagina = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const filas = useRef<HTMLTableSectionElement>(null);
  const { readyFor } = usePageEnter(pagina);
  const consulta = useConsulta(
    (signal) => reglasApi.versiones(signal),
    usuario ? "versiones" : null,
  );
  const datos = useArrival(
    readyFor,
    caja,
    consulta.estado === "listo" ? consulta.datos : null,
  );
  useRowsEnter(filas, datos?.vigente);
  const v = datos?.vigente;
  const fallo = consulta.estado === "error";
  // Versions come newest first: the last scheduled one is the next to start.
  const programada = datos?.versiones.findLast(
    (x) => x.estado === "PROGRAMADA",
  );

  const [creando, setCreando] = useState(false);
  const [falloCrear, setFalloCrear] = useState<string | null>(null);
  async function crear() {
    setCreando(true);
    setFalloCrear(null);
    try {
      const borrador = await reglasApi.crear();
      router.push(
        `/rules-config/drafts/${encodeURIComponent(borrador.borradorId)}`,
      );
    } catch (error) {
      setFalloCrear(
        error instanceof ErrorReglas
          ? error.message
          : "No se pudo crear el borrador. Inténtelo nuevamente.",
      );
      setCreando(false);
    }
  }

  return (
    <div ref={pagina} className={s.page}>
      <PageHeader
        titulo="Reglas del índice"
        contexto={
          v
            ? `Versión ${v.version}, vigente desde el ${fecha(v.effectiveFrom)}.${
                programada
                  ? ` La versión ${programada.version} comienza el ${fecha(programada.effectiveFrom)}.`
                  : ""
              }`
            : "Cómo se calcula el índice de carga de trabajo."
        }
        acciones={
          edita ? (
            <Button variante="primary" onClick={crear} disabled={creando}>
              {creando ? "Creando…" : "Nuevo borrador"}
            </Button>
          ) : undefined
        }
      />
      {falloCrear && <ErrorBox mensaje={falloCrear} />}

      <div className={s.rejilla}>
        <Section
          className={s.factores}
          titulo="Cuatro factores, un índice de 0 a 100"
          aside={v ? <span>Una semana, de lunes a domingo</span> : undefined}
        >
          <div ref={caja}>
            {consulta.estado === "error" ? (
              <ErrorBox
                mensaje={consulta.mensaje}
                onRetry={consulta.reintentar}
              />
            ) : !v ? (
              <SkeletonRows filas={4} />
            ) : (
              <>
                <DataTable etiqueta="Factores del índice">
                  <thead>
                    <tr>
                      <th scope="col">Factor</th>
                      <th scope="col" className={tabla.num}>
                        Umbral
                      </th>
                      <th scope="col">Peso en el índice</th>
                    </tr>
                  </thead>
                  <tbody ref={filas}>
                    {FACTORES.map((f) => (
                      <tr key={f}>
                        <th scope="row">
                          {FACTOR[f]}
                          <span className={tabla.sub}>{MIDE[f]}</span>
                        </th>
                        <td className={tabla.num}>
                          <strong className={s.umbral}>
                            {valorFactor(f, v.thresholds[f])}
                          </strong>
                        </td>
                        <td>
                          <span className={s.peso}>
                            <span className={s.pesoBarra} aria-hidden="true">
                              <span
                                style={{ width: `${v.weights[f] * 100}%` }}
                              />
                            </span>
                            <span className="num">
                              {porcentaje(v.weights[f])}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                <p className={s.formula}>
                  Cada factor suma 50 puntos al alcanzar su umbral y 100 al
                  duplicarlo; desde el umbral se considera superado. El índice
                  es la suma de los cuatro factores según su peso.
                </p>
              </>
            )}
          </div>
        </Section>

        {!fallo && (
          <Section className={s.niveles} titulo="Niveles">
            {!v ? <SkeletonRows filas={4} /> : <Niveles reglas={v} />}
          </Section>
        )}

        <Section className={s.noEsSeccion} titulo="Qué no es">
          <ul className={s.noEs}>
            <li>
              Un diagnóstico médico. El <em>burnout</em> es un fenómeno
              ocupacional, no una enfermedad (OMS, CIE-11, QD85).
            </li>
            <li>
              Una calificación de las personas: describe condiciones de trabajo.
            </li>
            <li>
              Una decisión: ordena qué revisar primero y la decisión la toma una
              persona.
            </li>
            <li>
              Algo que vea la persona evaluada: en Mis datos se muestran los
              datos cargados, nunca el índice.
            </li>
          </ul>
        </Section>

        {!fallo && (
          <Section className={s.versiones} titulo="Historial de versiones">
            {!datos ? (
              <SkeletonRows filas={2} />
            ) : (
              <DataTable etiqueta="Versiones de las reglas">
                <thead>
                  <tr>
                    <th scope="col">Versión</th>
                    <th scope="col">Inicio</th>
                    <th scope="col" className={tabla.centro}>
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {datos.versiones.map((version) => (
                    <tr key={version.version}>
                      <th scope="row">
                        {version.version}
                        <span className={`${tabla.sub} ${s.detalleVersion}`}>
                          {detalleVersion(version)}
                        </span>
                      </th>
                      <td className={s.fecha}>{fecha(version.effectiveFrom)}</td>
                      <td className={tabla.centro}>
                        <StatusTag tono={TONO_VERSION[version.estado]}>
                          {ESTADO_VERSION[version.estado]}
                        </StatusTag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Section>
        )}
      </div>

      {gestiona && <Borradores edita={edita} />}
    </div>
  );
}

/** Who published a version and why, when the version came from a draft. */
function detalleVersion(version: VersionReglasDTO) {
  // A version without a known user came from the system (seed or command line): never show its raw id.
  const autor = version.createdBy.rol
    ? `Publicada por ${version.createdBy.nombre}`
    : "Publicada por el sistema";
  const aprobada = version.aprobadoPor
    ? `; aprobada por ${version.aprobadoPor.nombre}`
    : "";
  return version.motivo ? `${autor}${aprobada}. ${version.motivo}` : autor;
}

/** Drafts of rule changes, newest first, with the state each one is in. */
function Borradores({ edita }: { edita: boolean }) {
  const [estado, setEstado] = useState<EstadoBorradorReglas | "">("");
  const [numero, setNumero] = useState(1);
  const consulta = useConsulta(
    (signal) =>
      reglasApi.borradores(
        { estado: estado || undefined, page: numero, pageSize: POR_PAGINA },
        signal,
      ),
    `borradores:${estado}:${numero}`,
  );
  const datos = consulta.estado === "listo" ? consulta.datos : null;
  const paginas = datos ? Math.ceil(datos.total / datos.pageSize) : 1;
  return (
    <Section
      titulo="Borradores de reglas"
      aside={
        datos && (
          <span className="num">
            {datos.total === 1 ? "1 borrador" : `${datos.total} borradores`}
          </span>
        )
      }
    >
      <Toolbar>
        <SelectField
          etiqueta="Estado"
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value as EstadoBorradorReglas | "");
            setNumero(1);
          }}
        >
          <option value="">Todos</option>
          {(Object.keys(ESTADO_BORRADOR) as EstadoBorradorReglas[]).map((e) => (
            <option key={e} value={e}>
              {ESTADO_BORRADOR[e]}
            </option>
          ))}
        </SelectField>
        {estado && (
          <Button
            variante="quiet"
            onClick={() => {
              setEstado("");
              setNumero(1);
            }}
          >
            Quitar filtros
          </Button>
        )}
      </Toolbar>
      {consulta.estado === "error" ? (
        <ErrorBox mensaje={consulta.mensaje} onRetry={consulta.reintentar} />
      ) : !datos ? (
        <SkeletonRows filas={3} />
      ) : datos.items.length === 0 ? (
        estado ? (
          <Empty titulo="Ningún borrador coincide con los filtros aplicados." />
        ) : (
          <Empty titulo="Todavía no hay borradores de reglas.">
            {edita
              ? "Cree un borrador para proponer un cambio en los pesos, los umbrales o los niveles."
              : "Los borradores aparecerán cuando RR. HH. proponga un cambio de reglas."}
          </Empty>
        )
      ) : (
        <>
          <DataTable etiqueta="Borradores de reglas">
            <thead>
              <tr>
                <th scope="col">Borrador</th>
                <th scope="col" className={tabla.centro}>
                Estado
              </th>
                <th scope="col">Alcance</th>
                <th scope="col">Motivo</th>
                <th scope="col">Creado por</th>
                <th scope="col">Última modificación</th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((b) => (
                <tr key={b.borradorId}>
                  <th scope="row">
                    <Link
                      className={tabla.rowLink}
                      href={`/rules-config/drafts/${encodeURIComponent(b.borradorId)}`}
                    >
                      Inicio el {fecha(b.effectiveFrom)}
                    </Link>
                    <span className={tabla.sub}>
                      {b.versionPublicada
                        ? `Publicado como ${b.versionPublicada}`
                        : `Basado en ${b.baseVersion}`}
                    </span>
                  </th>
                  <td className={tabla.centro}>
                    <StatusTag tono={TONO_BORRADOR[b.estado]}>
                      {ESTADO_BORRADOR[b.estado]}
                    </StatusTag>
                  </td>
                  <td>
                    {!b.simulado
                      ? "Sin simular"
                      : b.retroactivo
                        ? "Semanas ya evaluadas"
                        : "Semanas futuras"}
                  </td>
                  <td className={s.motivo}>
                    {b.motivo || "Sin motivo todavía"}
                  </td>
                  <td>{b.creadoPor.nombre}</td>
                  <td className={s.fecha}>{momentoConAnio(b.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {paginas > 1 && (
            <div className={s.pie}>
              <Pagination
                pagina={datos.page}
                paginas={paginas}
                onCambio={setNumero}
                etiqueta="Páginas de borradores"
              />
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/** One sentence per level, from the limits in force; then how a week is compared. */
function Niveles({ reglas }: { reglas: ConfiguracionIndice }) {
  const {
    mediumLimit: medio,
    highLimit: alto,
    minExceededFactors: comunes,
  } = reglas;
  return (
    <div className={s.niveles}>
      <dl className={s.lista}>
        <div>
          <dt>
            <LevelTag nivel="BAJO" />
          </dt>
          <dd>Índice menor a {medio}.</dd>
        </div>
        <div>
          <dt>
            <LevelTag nivel="MEDIO" />
          </dt>
          <dd>Índice de {medio} o más, sin cumplir la condición de Alto.</dd>
        </div>
        <div>
          <dt>
            <LevelTag nivel="ALTO" />
          </dt>
          <dd>
            Índice de {alto} o más durante dos semanas consecutivas, con al
            menos {comunes} factores superados en las dos.
          </dd>
        </div>
        <div>
          <dt>
            <LevelTag nivel="INCOMPLETO" />
          </dt>
          <dd>
            Falta la semana anterior: no se puede confirmar si la carga se
            sostiene.
          </dd>
        </div>
      </dl>
      <p className={s.persistencia}>
        <strong>Persistencia.</strong> Cada semana se compara con la
        inmediatamente anterior. Si esa semana no está cargada, la serie se
        interrumpe y el resultado queda Incompleto: nunca se supone la carga.
      </p>
    </div>
  );
}
