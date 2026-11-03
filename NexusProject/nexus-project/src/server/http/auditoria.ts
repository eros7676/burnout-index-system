import { Prisma, type PrismaClient } from "@prisma/client";
import {
  ACCIONES_AUDITORIA,
  ENTIDADES_AUDITORIA,
} from "../../shared/auditoria-catalogo";
import { ErrorConsulta } from "../services/filtros-consultas";

export function filtrosAuditoria(request: Request) {
  const params = new URL(request.url).searchParams;
  const permitidos = [
    "accion",
    "entidad",
    "recursoId",
    "actorId",
    "desde",
    "hasta",
    "page",
    "pageSize",
  ];
  for (const key of params.keys())
    if (!permitidos.includes(key) || params.getAll(key).length !== 1)
      throw new ErrorConsulta(400, "Filtros desconocidos o repetidos.");
  const where: Prisma.EventoAuditoriaWhereInput = {};
  for (const key of ["actorId", "recursoId"] as const)
    if (params.has(key)) {
      const valor = params.get(key)!;
      if (
        !valor.trim() ||
        valor.length > 64 ||
        /[\u0000-\u001f\u007f]/.test(valor)
      )
        throw new ErrorConsulta(400, "Identificador inválido.");
      where[key] = valor;
    }
  if (params.has("accion")) {
    const accion = params.get("accion")!;
    if (!(ACCIONES_AUDITORIA as readonly string[]).includes(accion))
      throw new ErrorConsulta(400, "Acción inválida.");
    where.accion = accion;
  }
  if (params.has("entidad")) {
    const entidad = params.get("entidad")!;
    if (!Object.hasOwn(ENTIDADES_AUDITORIA, entidad))
      throw new ErrorConsulta(400, "Entidad inválida.");
    where.entidad = entidad;
  }
  const fechas: { gte?: Date; lte?: Date } = {};
  for (const key of ["desde", "hasta"] as const)
    if (params.has(key)) {
      const texto = params.get(key)!;
      const fecha = new Date(texto);
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(texto) ||
        !Number.isFinite(fecha.getTime()) ||
        fecha.toISOString() !== texto
      )
        throw new ErrorConsulta(400, "Usá fechas UTC ISO con milisegundos.");
      fechas[key === "desde" ? "gte" : "lte"] = fecha;
    }
  if (fechas.gte && fechas.lte && fechas.gte > fechas.lte)
    throw new ErrorConsulta(400, "Intervalo de fechas inválido.");
  if (Object.keys(fechas).length) where.createdAt = fechas;
  const entero = (key: string, defecto: number, maximo: number) => {
    const texto = params.get(key);
    if (texto === null) return defecto;
    const n = Number(texto);
    if (!/^[1-9]\d*$/.test(texto) || !Number.isSafeInteger(n) || n > maximo)
      throw new ErrorConsulta(400, "Paginación inválida.");
    return n;
  };
  return {
    where,
    page: entero("page", 1, 1_000_000),
    pageSize: entero("pageSize", 50, 100),
  };
}

export function crearHttpAuditoria(db: PrismaClient) {
  return async (request: Request) => {
    try {
      const { where, page, pageSize } = filtrosAuditoria(request);
      const body = await db.$transaction(
        async (tx) => {
          const total = await tx.eventoAuditoria.count({ where });
          const items = await tx.eventoAuditoria.findMany({
            where,
            skip: (page - 1) * pageSize,
            take: pageSize,
            orderBy: [{ createdAt: "desc" }, { eventoId: "desc" }],
          });
          return {
            items: items.map(({ clave: _clave, ...evento }) => {
              void _clave;
              return { ...evento, createdAt: evento.createdAt.toISOString() };
            }),
            total,
            page,
            pageSize,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
      );
      return Response.json(body, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const status = error instanceof ErrorConsulta ? 400 : 500;
      return Response.json(
        {
          error: {
            codigo: status === 400 ? "PETICION_INVALIDA" : "ERROR_INTERNO",
            mensaje:
              status === 400
                ? (error as Error).message
                : "No se pudo consultar la auditoría.",
            detalles: [],
          },
        },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
