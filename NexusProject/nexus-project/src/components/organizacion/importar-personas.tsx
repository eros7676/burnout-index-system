"use client";
// Bulk hire from a CSV (personas-v1): validate and preview, then confirm. The file is read twice
// on the server, so nothing is written until it is confirmed and a stale preview writes nothing.
import { useState } from "react";
import type { ErrorCampo } from "@/shared/contracts";
import type {
  ResultadoImportacionPersonas,
  VistaPreviaPersonas,
} from "@/shared/contratos/organizacion";
import { entero } from "@/shared/formato";
import {
  Button,
  ButtonLink,
  DataTable,
  Empty,
  Figure,
  Icon,
  Notice,
  PageHeader,
  Section,
  tabla,
} from "@/shared/ui";
import { ErrorApi, organizacionApi } from "./api";
import { PaginaOrg } from "./piezas";
import { PLANTILLA_PERSONAS, PUESTO, contar, fechaCorta } from "./textos";
import { useEnvio } from "./use-envio";
import s from "./organizacion.module.css";

const tamano = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;

function descargarPlantilla() {
  const url = URL.createObjectURL(
    new Blob([PLANTILLA_PERSONAS], { type: "text/csv;charset=utf-8" }),
  );
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "personas-v1.csv";
  enlace.click();
  URL.revokeObjectURL(url);
}

/** Errors of the file, by row and column (a spreadsheet user fixes them in the file). */
function ErroresDelArchivo({ errores }: { errores: ErrorCampo[] }) {
  return (
    <DataTable etiqueta="Errores del archivo">
      <thead>
        <tr>
          <th scope="col" className={tabla.num}>
            Fila
          </th>
          <th scope="col">Columna</th>
          <th scope="col">Detalle</th>
        </tr>
      </thead>
      <tbody>
        {errores.map((e, i) => (
          <tr key={`${e.fila}:${e.campo}:${e.codigo}:${i}`}>
            <td className={tabla.num}>{e.fila ?? "—"}</td>
            <td>{e.campo ?? "—"}</td>
            <td>{e.detalle}</td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function VistaPrevia({ vista }: { vista: VistaPreviaPersonas }) {
  return (
    <>
      <div className={s.cifras}>
        <Figure etiqueta="Filas del archivo" valor={entero(vista.totalFilas)} />
        <Figure etiqueta="Personas nuevas" valor={entero(vista.nuevas)} />
        <Figure
          etiqueta="Ya registradas"
          valor={entero(vista.omitidas)}
          detalle="Se omiten: mismos datos"
        />
      </div>
      {vista.errores.length > 0 ? (
        <>
          <Notice tono="aviso">
            El archivo tiene {contar(vista.errores.length, "error", "errores")}. No se
            crea ninguna persona hasta corregirlos y volver a cargarlo.
          </Notice>
          <ErroresDelArchivo errores={vista.errores} />
        </>
      ) : (
        vista.nuevas > 0 && (
          <DataTable etiqueta="Primeras personas nuevas">
            <thead>
              <tr>
                <th scope="col" className={tabla.num}>
                  Fila
                </th>
                <th scope="col">Legajo</th>
                <th scope="col">Nombre</th>
                <th scope="col">Puesto</th>
                <th scope="col">Equipo</th>
                <th scope="col">Vigente desde</th>
              </tr>
            </thead>
            <tbody>
              {vista.muestra.map((p) => (
                <tr key={p.fila}>
                  <td className={tabla.num}>{p.fila}</td>
                  <th scope="row">{p.employeeId}</th>
                  <td>{p.nombre}</td>
                  <td>{PUESTO[p.tipo]}</td>
                  <td>{p.teamId ?? "—"}</td>
                  <td>{fechaCorta(p.desde)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )
      )}
      {vista.advertencias.length > 0 && (
        <Notice tono="aviso">
          {contar(vista.advertencias.length, "advertencia", "advertencias")}: hay nombres que
          ya figuran en el catálogo (filas{" "}
          {vista.advertencias.map((a) => a.fila).join(", ")}). Verifique que no sean
          duplicados; no impiden la importación.
        </Notice>
      )}
    </>
  );
}

export function ImportarPersonas() {
  const { enviando, error, enviar } = useEnvio();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<VistaPreviaPersonas | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacionPersonas | null>(null);
  // A new key empties the native file input when the user starts over.
  const [intento, setIntento] = useState(0);

  const validar = () =>
    enviar(async () => {
      if (!archivo) throw new ErrorApi("Seleccione un archivo CSV para validar.");
      setVista(await organizacionApi.validarImportacion(archivo));
    });
  const confirmar = () =>
    enviar(async () => setResultado(await organizacionApi.confirmarImportacion(archivo!, vista!.huella)));
  const reiniciar = () => {
    setArchivo(null);
    setVista(null);
    setResultado(null);
    setIntento((n) => n + 1);
  };
  const detalles = error?.detalles.filter((d) => d.fila !== null) ?? [];
  const falla = error && (
    <>
      <p className={s.fallo} role="alert">
        {error.message}
      </p>
      {detalles.length > 0 && <ErroresDelArchivo errores={detalles} />}
    </>
  );

  return (
    <PaginaOrg>
      <PageHeader
        titulo="Importar personas"
        contexto="Alta de varias personas desde un archivo CSV"
        volver={{ href: "/employees", texto: "Personas" }}
      />

      {resultado ? (
        <Section titulo="Importación confirmada">
          <Notice tono="exito">
            Se {resultado.creadas === 1 ? "creó" : "crearon"}{" "}
            {contar(resultado.creadas, "persona", "personas")}
            {resultado.omitidas > 0 &&
              ` y se ${resultado.omitidas === 1 ? "omitió" : "omitieron"} ${contar(resultado.omitidas, "ya registrada", "ya registradas")}`}
            .
          </Notice>
          <div className={s.acciones}>
            <ButtonLink variante="primary" href="/employees">
              Ver personas
            </ButtonLink>
            <Button onClick={reiniciar}>Importar otro archivo</Button>
          </div>
        </Section>
      ) : (
        <>
          <Section
            titulo="Archivo"
            aside={
              <button type="button" className={s.plantilla} onClick={descargarPlantilla}>
                Descargar plantilla
              </button>
            }
          >
            <div className={s.cuerpo}>
              <p>
                El archivo sigue la plantilla personas-v1: CSV en UTF-8, hasta 1.000 filas y
                5 MB. Solo crea personas nuevas; si un legajo ya existe con otros datos, el
                archivo se rechaza completo.
              </p>
              <ul className={s.lista}>
                <li>
                  <code>employee_id</code>, <code>nombre</code> y <code>tipo</code> son
                  obligatorias. El tipo es TECNICO, TEAM_LEAD o GERENCIA.
                </li>
                <li>
                  <code>team_id</code> debe ser un equipo activo, salvo para Gerencia.
                </li>
                <li>
                  <code>vigente_desde</code> es un lunes; si falta, rige desde la semana
                  actual. <code>en_cobertura</code> es true o false.
                </li>
              </ul>
              <div className={s.zona} data-elegido={archivo ? "" : undefined}>
                <input
                  key={intento}
                  id="archivo-personas"
                  className={s.input}
                  type="file"
                  name="archivo"
                  accept=".csv,text/csv"
                  aria-labelledby="archivo-personas-etiqueta"
                  disabled={enviando}
                  onChange={(e) => {
                    setArchivo(e.target.files?.[0] ?? null);
                    setVista(null);
                  }}
                />
                <span className={s.zonaIcono} aria-hidden="true">
                  <Icon nombre="importar" size={20} />
                </span>
                <span className={s.zonaTexto}>
                  <span id="archivo-personas-etiqueta" className={s.zonaTitulo}>
                    Archivo CSV
                  </span>
                  <span className={s.zonaNombre}>
                    {archivo
                      ? `${archivo.name}, ${tamano(archivo.size)}`
                      : "Arrastre el archivo aquí o selecciónelo"}
                  </span>
                </span>
                <span className={s.zonaAccion} aria-hidden="true">
                  {archivo ? "Cambiar archivo" : "Seleccionar archivo"}
                </span>
              </div>
              <div className={s.acciones}>
                <Button
                  variante="primary"
                  disabled={enviando || !archivo}
                  onClick={() => void validar()}
                >
                  Validar archivo
                </Button>
              </div>
              {!vista && falla}
            </div>
          </Section>

          {vista && (
            <Section titulo="Vista previa" aside={<span>{archivo?.name}</span>}>
              <div className={s.cuerpo}>
                <VistaPrevia vista={vista} />
                {falla}
                {vista.estado === "RECHAZADA" || vista.nuevas === 0 ? (
                  <>
                    {vista.estado === "VALIDADA" && (
                      <Empty titulo="El archivo no contiene personas nuevas">
                        Todas las filas corresponden a personas ya registradas.
                      </Empty>
                    )}
                    <div className={s.acciones}>
                      <Button onClick={reiniciar}>Cargar otro archivo</Button>
                    </div>
                  </>
                ) : (
                  <div className={s.acciones}>
                    <Button
                      variante="primary"
                      disabled={enviando}
                      onClick={() => void confirmar()}
                    >
                      {`Confirmar importación de ${contar(vista.nuevas, "persona", "personas")}`}
                    </Button>
                    <Button variante="quiet" disabled={enviando} onClick={reiniciar}>
                      Cancelar
                    </Button>
                  </div>
                )}
              </div>
            </Section>
          )}
        </>
      )}
    </PaginaOrg>
  );
}
