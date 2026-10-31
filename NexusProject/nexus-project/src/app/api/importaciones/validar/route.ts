import { NextResponse } from 'next/server';
import { validarLote } from '../../../../../services/validationService';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No se subió ningún archivo' }, { status: 400 });
    }

    // 1. Validar límite físico: 5 MiB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Tamaño excedido (máximo 5MB)' }, { status: 413 });
    }
    
    const text = await file.text();
    const lineas = text.split('\n').filter(line => line.trim() !== '');
    
    // 2. Límite de filas
    if (lineas.length - 1 > 1000) { 
      return NextResponse.json({ error: 'Excede 1000 filas' }, { status: 413 });
    }

    // Parseo básico del CSV para probar el prototipo
    const filasParseadas = lineas.slice(1).map(linea => {
      const valores = linea.split(',');
      return {
        employeeId: valores[0]?.trim(),
        periodStart: valores[1]?.trim(),
        periodEnd: valores[2]?.trim(),
        horasExtra: Number(valores[3] || 0),
        diasConsecutivosSinDescanso: Number(valores[4] || 0),
        tareasActivas: Number(valores[5] || 0),
        tareasPendientes: Number(valores[6] || 0),
        tareasVencidas: Number(valores[7] || 0),
        vacacionesPendientesDias: Number(valores[8] || 0),
        horasTrabajadas: Number(valores[9] || 0)
      };
    });

    // 3. Llamar al motor de validación (T05)
    // Pasamos null como dbContext hasta que Gonzalo termine la Base de Datos
    const resultado = await validarLote(filasParseadas, null);

    // 4. Si hay errores, se rechaza todo el lote (HTTP 422)
    if (resultado.errores.length > 0) {
      return NextResponse.json({ 
        status: 'RECHAZADA', 
        errores: resultado.errores 
      }, { status: 422 });
    }

    // 5. Si todo está perfecto (HTTP 200)
    return NextResponse.json({ 
      importId: "temp-id-123", // Se generará dinámicamente más adelante
      status: 'VALIDADA', 
      nuevas: resultado.nuevas,
      warnings: resultado.warnings
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ error: 'Error procesando la petición' }, { status: 500 });
  }
}