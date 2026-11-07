// The task detail behind a person's weekly counts (tareas-v1), shared by the demo generators.
// Each week reconciles by construction: A rows, of which A-P were completed in the week, P-V are
// open and not yet due, and V are open and due on or before the closing Sunday. Open tasks carry
// over with the same task_id, and the ones resolved without completion are cancelled or reassigned.
import { sumar } from "./azar.mjs";

/**
 * A task writer for one company: `azar` is the generator's random source (its call order is part of
 * the output), `prefijo` the task id prefix, `titulos` functions of a reference number, `origenes`
 * the source systems, `ref` the link of a task id or "" (some tasks have none).
 */
export function crearTareas({ azar: { azar, entre, elegir }, prefijo, titulos, origenes, ref }) {
  let contador = 1000;
  function nueva(campos) {
    const n = contador++;
    const origen = elegir(origenes);
    return {
      id: `${prefijo}${n}`,
      // A reference number in the title that is not the task id, so the two never read alike.
      titulo: elegir(titulos)((n * 37) % 900 + 100),
      origen,
      ref: azar() < 0.75 ? ref(`${prefijo}${n}`) : "",
      asignada: "",
      vence: null,
      completada: null,
      ...campos,
    };
  }

  /**
   * One person's weeks. `pool` holds the tasks still open at the previous close; each week keeps
   * as many of them open as its counts ask for and resolves the rest (completed first, then
   * cancelled or reassigned); anything missing is created.
   */
  return function tareasDePersona(id, semanas) {
    const filas = [];
    let pool = [];
    semanas.forEach((w, indice) => {
      const primera = indice === 0;
      const { inicio: S, fin: E } = w;
      const completadas = w.activas - w.pendientes;
      const alDia = w.pendientes - w.vencidas;
      const vencidasPool = pool.filter((t) => t.vence !== null && t.vence <= E);
      const alDiaPool = pool.filter((t) => t.vence === null || t.vence > E);
      const sigueVencida = vencidasPool.slice(0, w.vencidas);
      const sigueAlDia = alDiaPool.slice(0, alDia);
      const resueltas = [
        ...vencidasPool.slice(w.vencidas),
        ...alDiaPool.slice(alDia),
      ];

      const terminadas = resueltas.slice(0, completadas);
      for (const t of terminadas)
        t.completada = sumar(S, entre(0, 6));
      const excluidas = resueltas.slice(completadas);
      for (const t of excluidas)
        t.motivo = azar() < 0.5 ? "REASIGNADA" : "CANCELADA";
      // A completion cannot precede the assignment (carried tasks were assigned before S).
      for (let i = terminadas.length; i < completadas; i++) {
        const asignada = sumar(S, primera ? -entre(1, 10) : -entre(0, 6));
        const base = asignada > S ? asignada : S;
        const sugerida = sumar(base, entre(0, 6));
        const completada = sugerida > E ? E : sugerida;
        const limite = sumar(completada, entre(-3, 7));
        terminadas.push(
          nueva({
            asignada,
            completada,
            // Due dates never precede the assignment.
            vence: azar() < 0.9 ? (limite < asignada ? asignada : limite) : null,
          }),
        );
      }

      const frescasVencidas = Array.from(
        { length: w.vencidas - sigueVencida.length },
        () => {
          const vence = primera ? sumar(E, -entre(0, 21)) : sumar(E, -entre(0, 6));
          return nueva({ vence, asignada: sumar(vence, -entre(3, 14)) });
        },
      );
      const frescasAlDia = Array.from(
        { length: alDia - sigueAlDia.length },
        () =>
          nueva({
            vence: azar() < 0.9 ? sumar(E, entre(1, 14)) : null,
            asignada: sumar(E, -entre(0, primera ? 16 : 6)),
          }),
      );

      const numero = (t) => Number(t.id.slice(prefijo.length));
      for (const t of [
        ...sigueVencida,
        ...sigueAlDia,
        ...frescasVencidas,
        ...frescasAlDia,
        ...terminadas,
        ...excluidas,
      ].sort((a, b) => numero(a) - numero(b)))
        filas.push({ semana: w, tarea: t, motivo: excluidas.includes(t) ? t.motivo : "" });
      pool = [...sigueVencida, ...sigueAlDia, ...frescasVencidas, ...frescasAlDia];
    });
    // Completion dates are final only after the last week: write every row now.
    return filas.map(({ semana, tarea, motivo }) => [
      id,
      semana.inicio,
      semana.fin,
      tarea.id,
      tarea.titulo,
      tarea.origen,
      tarea.ref,
      tarea.asignada,
      tarea.vence ?? "",
      tarea.completada ?? "",
      motivo,
    ]);
  };
}
