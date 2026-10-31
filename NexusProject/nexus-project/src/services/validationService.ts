export async function validarLote(filasParseadas: any[], dbContext: any) {
  const errores = [];
  const omitidas = [];
  const nuevas = [];
  const warnings = [];

  for (const fila of filasParseadas) {
    // 1. Validar campos obligatorios
    if (!fila.employeeId || !fila.periodStart || !fila.periodEnd) {
      errores.push({ fila, codigo: 'OBLIGATORIO' });
      continue;
    }

    // 2. Validar consistencia de tareas (0 <= V <= P <= A)
    if (!(0 <= fila.tareasVencidas && fila.tareasVencidas <= fila.tareasPendientes && fila.tareasPendientes <= fila.tareasActivas)) {
      errores.push({ fila, codigo: 'RANGO_INVALIDO' });
      continue;
    }

    // 3. Advertencias por horas extremas (no rechaza la fila)
    if (fila.horasTrabajadas > 80 || fila.horasExtra > 40) {
      warnings.push({ fila, codigo: 'HORAS_EXTREMAS' });
    }

    // Si pasa todas las validaciones básicas (y luego las de DB), es nueva
    nuevas.push(fila);
  }

  return { errores, omitidas, nuevas, warnings };
}