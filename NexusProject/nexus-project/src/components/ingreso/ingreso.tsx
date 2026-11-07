"use client";
import { useRef, useState } from "react";
import { useConsulta } from "@/client/use-consulta";
import type { UsuarioDemoDTO } from "@/shared/contracts";
import { usePageEnter } from "@/shared/motion";
import { ErrorBox, SkeletonRows } from "@/shared/ui";
import { elegirUsuario, leerSesion } from "../shell/sesion";
import s from "./ingreso.module.css";

const QUE_VE: Record<UsuarioDemoDTO["rol"], string> = {
  RRHH: "Toda la empresa. Importa datos y simula avisos.",
  GERENCIA: "Toda la empresa y la auditoría, solo en consulta.",
  TEAM_LEAD: "Solo su equipo.",
  EMPLEADO: "Sus propias horas y tareas. Nunca ve un índice.",
};

/**
 * Entry of the demo: pick a company (when the server has more than one) and who to view it as.
 * Stands in for login. Each company is its own database, so its profiles are its own teams' leads.
 */
export function Ingreso({ empresa: inicial }: { empresa?: string }) {
  const pagina = useRef<HTMLDivElement>(null);
  usePageEnter(pagina);
  const [elegida, setElegida] = useState(inicial);
  const sesion = useConsulta(
    (signal) => leerSesion(signal, elegida),
    `sesion:${elegida ?? ""}`,
  );
  const [error, setError] = useState<string>();
  const [eligiendo, setEligiendo] = useState<string>();
  const datos = sesion.estado === "listo" ? sesion.datos : null;
  const empresa = datos?.empresa.id;

  const entrar = (usuario: UsuarioDemoDTO) => {
    setEligiendo(usuario.userId);
    elegirUsuario(usuario, empresa).catch((e: Error) => {
      setEligiendo(undefined);
      setError(e.message);
    });
  };

  return (
    <div className={s.page} ref={pagina}>
      <header className={s.header} data-enter>
        <p className={s.brand}>
          <span aria-hidden="true">N</span>Nexo Laboral
        </p>
        <h1>Seguimiento semanal de la carga de trabajo</h1>
        <p className={s.lead}>
          Seguimiento de las horas extra, los días sin descanso y las tareas vencidas
          que se sostienen semana tras semana, para revisarlos a tiempo.
        </p>
      </header>
      {datos && datos.empresas.length > 1 && (
        <section className={s.panel} data-enter aria-labelledby="empresa">
          <h2 id="empresa">Empresa</h2>
          <ul className={s.users}>
            {datos.empresas.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className={s.user}
                  onClick={() => setElegida(e.id)}
                  disabled={!!eligiendo}
                  aria-pressed={e.id === empresa}
                >
                  <span className={s.userName}>{e.nombre}</span>
                  <span className={s.userRubro}>{e.rubro}</span>
                  <span className={s.userScope}>{e.descripcion}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={s.panel} data-enter aria-labelledby="perfil">
        <h2 id="perfil">
          Seleccione un perfil para ingresar
          {datos && datos.empresas.length > 1 ? ` a ${datos.empresa.nombre}` : ""}
        </h2>
        {sesion.estado === "cargando" && <SkeletonRows filas={4} />}
        {sesion.estado === "error" && (
          <ErrorBox mensaje={sesion.mensaje} onRetry={sesion.reintentar} />
        )}
        {error && <ErrorBox mensaje={error} />}
        {sesion.estado === "listo" && (
          <ul className={s.users}>
            {sesion.datos.usuarios.map((u) => (
              <li key={u.userId}>
                <button
                  type="button"
                  className={s.user}
                  onClick={() => entrar(u)}
                  disabled={!!eligiendo}
                  aria-current={
                    sesion.datos.usuario?.userId === u.userId ? "true" : undefined
                  }
                >
                  <span className={s.userName}>{u.nombre}</span>
                  <span className={s.userScope}>{QUE_VE[u.rol]}</span>
                  {eligiendo === u.userId && (
                    <span className={s.userState} role="status">
                      Ingresando…
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className={s.foot} data-enter>
        Demostración con datos ficticios. El índice señala una posible
        sobrecarga de trabajo; no es un diagnóstico médico y no reemplaza la
        conversación con la persona.
      </p>
    </div>
  );
}
