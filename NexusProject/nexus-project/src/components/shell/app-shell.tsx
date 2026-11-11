"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useConsulta } from "@/client/use-consulta";
import { ROL } from "@/shared/formato";
import { ErrorBox, Icon } from "@/shared/ui";
import {
  NAVEGACION,
  SesionProvider,
  elegirUsuario,
  inicioDe,
  leerSesion,
  puedeAbrir,
} from "./sesion";
import { Accesibilidad } from "../accesibilidad/accesibilidad";
import { rutaMiEquipo } from "../organizacion/rutas";
import s from "./app-shell.module.css";

/**
 * The frame of every signed-in screen: a demo strip naming who you are viewing
 * as (the app's single disclaimer), a sidebar with only the screens the role
 * may open, and the page.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const ruta = usePathname();
  const router = useRouter();
  const sesion = useConsulta(leerSesion, "sesion");
  const [errorCambio, setErrorCambio] = useState<string>();
  const usuario = sesion.estado === "listo" ? sesion.datos.usuario : undefined;
  const fuera =
    sesion.estado === "listo" && (!usuario || !puedeAbrir(usuario.rol, ruta, usuario.teamId));

  useEffect(() => {
    if (sesion.estado !== "listo") return;
    if (!usuario) router.replace("/");
    else if (!puedeAbrir(usuario.rol, ruta, usuario.teamId))
      router.replace(inicioDe(usuario.rol));
  }, [sesion.estado, usuario, ruta, router]);

  const usuarios = sesion.estado === "listo" ? sesion.datos.usuarios : [];
  const correo = sesion.estado === "listo" ? sesion.datos.correo : "SIMULADO";
  const empresa = sesion.estado === "listo" ? sesion.datos.empresa : null;
  const empresas = sesion.estado === "listo" ? sesion.datos.empresas : [];
  const visible = usuario && !fuera ? usuario : null;
  // Another company is another database: the same profile there, or its login list when it has none.
  const cambiarEmpresa = (id: string) => {
    if (!visible) return;
    elegirUsuario(visible, id).catch(() => router.replace(`/?empresa=${encodeURIComponent(id)}`));
  };
  return (
    <SesionProvider value={{ empresa, usuario: visible, usuarios, correo }}>
      <div className={s.app}>
        <div className={s.demo} role="region" aria-label="Modo demostración">
          <p>
            <strong>Modo demostración</strong> con datos ficticios. El índice
            señala una posible sobrecarga de trabajo; no es un diagnóstico
            médico.{" "}
            {visible && puedeAbrir(visible.rol, "/rules-config") && (
              <Link href="/rules-config">Cómo se calcula</Link>
            )}
          </p>
          {sesion.estado === "error" && (
            <ErrorBox mensaje={sesion.mensaje} onRetry={sesion.reintentar} />
          )}
          {visible && empresa && empresas.length > 1 && (
            <label className={s.switcher}>
              <span>Empresa</span>
              <select
                aria-label="Empresa de la demostración"
                value={empresa.id}
                onChange={(e) => cambiarEmpresa(e.target.value)}
              >
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {visible && (
            <label className={s.switcher}>
              <span>Perfil activo</span>
              <select
                aria-label="Perfil activo, usuario de demostración"
                value={visible.userId}
                onChange={(e) => {
                  const elegido = usuarios.find(
                    (u) => u.userId === e.target.value,
                  );
                  if (elegido)
                    elegirUsuario(elegido, empresa?.id).catch((error: Error) =>
                      setErrorCambio(error.message),
                    );
                }}
              >
                {usuarios.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {errorCambio && (
            <p role="alert" className={s.demoError}>
              {errorCambio}
            </p>
          )}
        </div>
        <aside className={s.sidebar} data-lenis-prevent>
          <Link
            href={visible ? inicioDe(visible.rol) : "/"}
            className={s.brand}
          >
            <span className={s.mark} aria-hidden="true">
              N
            </span>
            Nexo Laboral
          </Link>
          <p className={s.scope}>
            {visible
              ? `${ROL[visible.rol]}${visible.rol === "RRHH" || visible.rol === "GERENCIA" ? ", toda la empresa" : ""}`
              : " "}
            {visible && empresa && <span className={s.empresa}>{empresa.nombre}</span>}
          </p>
          <nav aria-label="Secciones">
            {NAVEGACION.map((grupo) => {
              const items = visible
                ? grupo.items.filter((i) => i.roles.includes(visible.rol))
                : [];
              const miEquipo = visible
                ? rutaMiEquipo(visible.rol, visible.teamId)
                : null;
              if (miEquipo && grupo.grupo === "Seguimiento")
                items.splice(
                  items.findIndex((i) => i.href === "/alerts"),
                  0,
                  { href: miEquipo, texto: "Mi equipo", icono: "equipos", roles: [visible!.rol] },
                );
              if (!items.length) return null;
              return (
                <div key={grupo.grupo} className={s.group}>
                  <p className={s.groupTitle}>{grupo.grupo}</p>
                  <ul>
                    {items.map((item) => {
                      const activo =
                        ruta === item.href || ruta.startsWith(`${item.href}/`);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            className={s.link}
                            aria-current={activo ? "page" : undefined}
                          >
                            <Icon nombre={item.icono} />
                            {item.texto}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
          <Accesibilidad variante="lateral" />
        </aside>
        <main className={s.main} id="contenido">
          {children}
        </main>
      </div>
    </SesionProvider>
  );
}
