"use client";
import { createContext, useContext } from "react";
import { API_ROUTES } from "@/shared/api";
import type { SesionDemoDTO, UsuarioDemoDTO } from "@/shared/contracts";
import type { Icono } from "@/shared/ui";
import { puedeAbrirOrganizacion } from "../organizacion/rutas";

type Rol = UsuarioDemoDTO["rol"];
const LECTURA: Rol[] = ["RRHH", "GERENCIA", "TEAM_LEAD"];

/** The app's map: every screen, who may open it, and where it sits in the sidebar. */
export const NAVEGACION: {
  grupo: string;
  items: { href: string; texto: string; icono: Icono; roles: Rol[] }[];
}[] = [
  {
    grupo: "Seguimiento",
    items: [
      { href: "/home", texto: "Resumen", icono: "resumen", roles: LECTURA },
      { href: "/employees", texto: "Personas", icono: "personas", roles: LECTURA },
      { href: "/teams", texto: "Equipos", icono: "equipos", roles: ["RRHH", "GERENCIA"] },
      { href: "/alerts", texto: "Alertas", icono: "alertas", roles: LECTURA },
    ],
  },
  {
    grupo: "Datos",
    items: [
      { href: "/importaciones", texto: "Importar datos", icono: "importar", roles: ["RRHH"] },
      { href: "/rules-config", texto: "Reglas del índice", icono: "reglas", roles: LECTURA },
      { href: "/audit", texto: "Auditoría", icono: "auditoria", roles: ["RRHH", "GERENCIA"] },
    ],
  },
  {
    grupo: "Mi espacio",
    items: [
      { href: "/my-data", texto: "Mis datos", icono: "misDatos", roles: ["EMPLEADO", "TEAM_LEAD"] },
    ],
  },
];
/** Screens reached from a list rather than the sidebar. */
const SUBRUTAS: { prefijo: string; roles: Rol[] }[] = [
  { prefijo: "/reports/", roles: LECTURA },
];

export const inicioDe = (rol: Rol) => (rol === "EMPLEADO" ? "/my-data" : "/home");

/** Whether a role may open a screen; a Team Lead's own team page needs the `teamId` of the session. */
export function puedeAbrir(rol: Rol, ruta: string, teamId?: string | null) {
  const organizacion = puedeAbrirOrganizacion(rol, ruta, teamId);
  if (organizacion !== null) return organizacion;
  const items = NAVEGACION.flatMap((g) => g.items);
  const item = items.find((i) => ruta === i.href || ruta.startsWith(`${i.href}/`));
  if (item) return item.roles.includes(rol);
  const sub = SUBRUTAS.find((s) => ruta.startsWith(s.prefijo));
  return sub ? sub.roles.includes(rol) : true;
}

/** The session, and the logins of `empresa` (the session's company when omitted). */
export async function leerSesion(signal: AbortSignal, empresa?: string): Promise<SesionDemoDTO> {
  const consulta = empresa ? `?${new URLSearchParams({ empresa })}` : "";
  const respuesta = await fetch(`${API_ROUTES.consultarSesionDemo.path}${consulta}`, {
    cache: "no-store",
    signal,
  });
  if (!respuesta.ok) throw new Error("No se pudo leer la sesión de demostración.");
  return respuesta.json();
}

/** Signs in as a demo user of a company (the default when omitted) and reloads at that role's first screen. */
export async function elegirUsuario(usuario: UsuarioDemoDTO, empresa?: string) {
  const respuesta = await fetch(API_ROUTES.seleccionarUsuarioDemo.path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(empresa ? { userId: usuario.userId, empresa } : { userId: usuario.userId }),
  });
  if (!respuesta.ok) throw new Error("No se pudo cambiar de usuario. Intente nuevamente.");
  window.location.assign(inicioDe(usuario.rol));
}

/** `usuario` is null until the session is read (or while redirecting away). */
const Sesion = createContext<{
  empresa: SesionDemoDTO["empresa"] | null;
  usuario: UsuarioDemoDTO | null;
  usuarios: readonly UsuarioDemoDTO[];
  correo: SesionDemoDTO["correo"];
} | null>(null);
export const SesionProvider = Sesion.Provider;

export function useSesion() {
  const sesion = useContext(Sesion);
  if (!sesion) throw new Error("useSesion fuera del shell de la aplicación.");
  return sesion;
}
