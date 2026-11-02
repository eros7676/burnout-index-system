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
  GERENCIA: "Toda la empresa y la auditoría, sin importar datos.",
  TEAM_LEAD: "Solo su célula.",
  EMPLEADO: "Sus propias horas y tareas. Nunca ve un índice.",
};

/** Entry of the demo: pick who to view the product as. Stands in for login. */
export function Ingreso() {
  const pagina = useRef<HTMLDivElement>(null);
  usePageEnter(pagina);
  const sesion = useConsulta(leerSesion, "sesion");
  const [error, setError] = useState<string>();
  const [eligiendo, setEligiendo] = useState<string>();

  const entrar = (usuario: UsuarioDemoDTO) => {
    setEligiendo(usuario.userId);
    elegirUsuario(usuario).catch((e: Error) => {
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
          Detecta quién sostiene horas extra, días sin descanso o tareas vencidas
          semana tras semana, para que una persona lo revise a tiempo.
        </p>
      </header>
      <section className={s.panel} data-enter aria-labelledby="perfil">
        <h2 id="perfil">Elegí con qué perfil entrar</h2>
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
                      Entrando…
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className={s.foot} data-enter>
        Demo académica con datos ficticios. El índice señala posible sobrecarga
        laboral; no es un diagnóstico y no reemplaza la conversación con la persona.
      </p>
    </div>
  );
}
