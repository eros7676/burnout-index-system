import nodemailer from "nodemailer";

/**
 * Real mail for alert notices, over authenticated SMTP (the domain's own mail server).
 * Every notice goes to one demo inbox (`MAIL_DESTINO_DEMO`): the people in the data are fictitious,
 * so nothing is ever sent to an invented address. Without the full configuration the system keeps
 * simulating the delivery, as before.
 */
export type ConfigCorreo = {
  host: string;
  port: number;
  usuario: string;
  clave: string;
  /** The From address, e.g. `Sistema de Índice de Burnout <alertas@example.com>`. */
  remitente: string;
  /** The only address any notice is delivered to. */
  destinoDemo: string;
  /** Where the alert links in the message point, without a trailing slash. */
  appUrl: string;
};

export type MensajeCorreo = { para: string; asunto: string; texto: string };

/** Sends one message; rejects when the server does not accept it. */
export type Enviador = (mensaje: MensajeCorreo) => Promise<void>;

const VARIABLES = ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAIL_FROM", "MAIL_DESTINO_DEMO"] as const;

/** The configuration when every required variable is set; null keeps the simulated channel. */
export function configCorreo(env: Record<string, string | undefined> = process.env): ConfigCorreo | null {
  if (VARIABLES.some((v) => !env[v]?.trim())) return null;
  const port = Number(env.SMTP_PORT ?? 465);
  if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) return null;
  return {
    host: env.SMTP_HOST!.trim(),
    port,
    usuario: env.SMTP_USER!.trim(),
    clave: env.SMTP_PASSWORD!,
    remitente: env.MAIL_FROM!.trim(),
    destinoDemo: env.MAIL_DESTINO_DEMO!.trim(),
    appUrl: (env.APP_URL?.trim() || "http://127.0.0.1:3000").replace(/\/+$/, ""),
  };
}

/** SMTP over TLS on 465, STARTTLS otherwise; short timeouts so a dead server fails the attempt. */
export function enviadorSmtp(config: ConfigCorreo): Enviador {
  const transporte = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.usuario, pass: config.clave },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return async ({ para, asunto, texto }) => {
    await transporte.sendMail({ from: config.remitente, to: para, subject: asunto, text: texto });
  };
}

/** The failure in words for the attempt's history: the SMTP code or class, never a credential. */
export function motivoFallo(error: unknown): string {
  const e = error as { code?: unknown; responseCode?: unknown };
  const partes = [
    typeof e?.code === "string" ? e.code : null,
    typeof e?.responseCode === "number" ? `SMTP ${e.responseCode}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : "error desconocido";
}
