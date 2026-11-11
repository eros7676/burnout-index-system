// A small stroke icon set on a 24-unit grid, always decorative: the text beside an icon
// carries its meaning. Two sizes only, 16 next to 12-14 px text and 20 next to 16 px text
// (R22), and one rendered stroke at both (R23).
const RUTAS = {
  resumen: "M4 13h4v7H4zM10 4h4v16h-4zM16 9h4v11h-4z",
  personas:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14.5a6.5 6.5 0 0 1 3.5 5.5",
  equipos:
    "M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z",
  alertas: "M12 3 2.5 20h19zM12 10v4.5M12 17.2v.3",
  importar: "M12 15V3M7 8l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4",
  reglas: "M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6",
  auditoria: "M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 16h6",
  misDatos: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  volver: "M15 5l-7 7 7 7",
  abrir: "M9 5l7 7-7 7",
  buscar: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  salir: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
  correo: "M3 6h18v12H3zM3 7l9 6 9-6",
  accesibilidad: "M12 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 9l7 1.5L19 9M12 10.5V14M9 20l3-6 3 6",
  // States (R27): circles, so they never read as the square and diamond marks of the levels.
  exito: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l3 3 5-6",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5.5M12 7.7v.1",
  error: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5v5.5M12 16.3v.1",
} as const;

export type Icono = keyof typeof RUTAS;

/**
 * `size` snaps to the nearest of the two sizes (16, or 20 from 19 up), so a screen
 * cannot introduce a third. The stroke is the same on screen at both.
 */
export function Icon({ nombre, size = 16 }: { nombre: Icono; size?: number }) {
  const lado = size >= 19 ? 20 : 16;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={lado}
      height={lado}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={RUTAS[nombre]} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
