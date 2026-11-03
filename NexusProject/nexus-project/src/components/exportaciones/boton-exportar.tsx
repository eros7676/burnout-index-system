"use client";
import { useRef, useState } from "react";
import { guardarArchivo, pedirExportacion } from "@/client/exportaciones-api";
import { tienePermiso } from "@/shared/permisos";
import type {
  FiltrosExportacion,
  TipoExportacion,
} from "@/shared/contratos/exportaciones";
import { entero } from "@/shared/formato";
import { Button } from "@/shared/ui";
import { useSesion } from "../shell/sesion";
import s from "./boton-exportar.module.css";

/**
 * Downloads the list on screen as a CSV file, with the filters it has. It shows only to roles with the
 * EXPORTAR permission; the server narrows a Team Lead's file to their team and records the export.
 * Place it in the PageHeader `acciones` of a list, passing the same filters the list sends.
 */
export function BotonExportar({
  tipo,
  filtros = {},
  etiqueta = "Exportar a CSV",
}: {
  tipo: TipoExportacion;
  filtros?: FiltrosExportacion;
  etiqueta?: string;
}) {
  const { usuario } = useSesion();
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{
    tipo: "listo" | "error";
    texto: string;
  } | null>(null);
  const bloqueo = useRef(false);
  if (!usuario || !tienePermiso(usuario.rol, "EXPORTAR")) return null;

  async function exportar() {
    if (bloqueo.current) return;
    bloqueo.current = true;
    setOcupado(true);
    setResultado(null);
    try {
      const archivo = await pedirExportacion(tipo, filtros);
      guardarArchivo(archivo);
      setResultado({
        tipo: "listo",
        texto:
          archivo.filas === null
            ? "Archivo generado."
            : `Archivo generado: ${entero(archivo.filas)} ${archivo.filas === 1 ? "fila" : "filas"}.`,
      });
    } catch (error) {
      setResultado({
        tipo: "error",
        texto:
          error instanceof Error
            ? error.message
            : "No se pudo generar el archivo.",
      });
    } finally {
      bloqueo.current = false;
      setOcupado(false);
    }
  }

  return (
    <div className={s.root}>
      <Button disabled={ocupado} aria-busy={ocupado} onClick={exportar}>
        {ocupado ? "Generando archivo…" : etiqueta}
      </Button>
      {/* The status region stays in the page, so a result is announced when it appears. */}
      <p role="status" className={s.message}>
        {resultado?.tipo === "listo" ? resultado.texto : ""}
      </p>
      {resultado?.tipo === "error" && (
        <p role="alert" className={`${s.message} ${s.error}`}>
          {resultado.texto}
        </p>
      )}
    </div>
  );
}
