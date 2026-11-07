// Sanatorio del Parque: nursing by shifts in ward, emergency, intensive care and surgery.
// Nurses work 12-hour shifts two on, two off, so a normal week is 36 to 48 hours and a short streak.
// Overload is staying after the shift and covering a colleague's shift on a day off, so overtime
// and vacation weigh more, and a streak counts as long from five days (60 hours at 12 a day).
// Risk of error rises past 12-hour shifts, overtime and 40 hours a week (Rogers et al., 2004).
// Sources: Docs/research/2026-11-07-rubros.md.

const PISOS = ["primer piso", "segundo piso", "tercer piso", "cuarto piso"];
const PERSONAL =
  "Carla Domínguez|Mariela Navarro|Lucía Cáceres|Romina Aguirre|Vanesa Torres|Yanina Méndez|Jésica Ramos|Soledad Ponce|Evelyn Juárez|Analía Barrios|Noelia Herrera|Mauro Cardozo|Valeria Sosa|Daniela Pereyra|Gisela Martínez|Karina Rivero|Leonardo Vera|Marina Benítez|Florencia Ortega|Débora Ruiz|Tamara Gómez|Ivana Leiva|Natalia Quiroga|Rodrigo Ferreyra|Melisa Correa|Patricio Ayala|Lorena Medina|Cintia Arias|Pamela Villalba|Mirta Castillo|Alejandro Luna|Gabriela Rojas|Marcela Ibarra|Silvana Ortiz|Brenda Toledo|Hernán Paz|Julieta Moreno|Viviana Godoy|Sabrina Figueroa|Rocío Molina|Andrea Carrizo|Agustina Peralta|Jorgelina Sánchez|Emilia Bustos|Cristina Lucero".split(
    "|",
  );

const perfil = {
  id: "salud",
  semilla: 20261109,
  equipos: {
    "EQ-01": "Internación General",
    "EQ-02": "Guardia Externa",
    "EQ-03": "Terapia Intensiva",
    "EQ-04": "Quirófano y Esterilización",
  },
  personas: {
    "GER-01": "Beatriz Montenegro",
    "TL-01": "Claudia Soria",
    "TL-02": "Fernando Rivarola",
    "TL-03": "Mónica Arce",
    "TL-04": "Paula Echeverría",
    ...Object.fromEntries(PERSONAL.map((n, i) => [`EMP-${String(i + 1).padStart(3, "0")}`, n])),
  },
  reglas: {
    weights: { HE: 0.35, DS: 0.25, CT: 0.15, VP: 0.25 },
    thresholds: { HE: 8, DS: 4, CT: 0.4, VP: 10 },
    mediumLimit: 40,
    highLimit: 70,
    minExceededFactors: 2,
  },
  /** Two 12-hour shifts on, two off, each person on their own rotation. */
  turno: ({ indice }) => (d) => ((d + indice) % 4 < 2 ? 12 : 0),
  /** Carla (EMP-001) covers shifts week after week; intensive care runs hot; the emergency room peaks. */
  carga({ id, equipo, indice }, { azar }) {
    if (id === "EMP-001") return () => 1;
    if (indice % 13 === 5) return (s) => (s === 4 ? 0.9 : 0.3);
    const ruido = () => (azar() - 0.5) * 0.3;
    const acotar = (c) => Math.min(1, Math.max(0, c));
    if (equipo === "EQ-03") return () => acotar(0.55 + ruido());
    if (equipo === "EQ-02") return (s) => acotar((s === 2 || s === 3 ? 0.8 : 0.3) + ruido());
    const base = id.startsWith("TL-") ? 0.45 : 0.25;
    return () => acotar(base + ruido());
  },
  extraPorDia: 1.5,
  descansoTrabajado: 0.8,
  horasDescanso: 8,
  licencia: 0.02,
  vacaciones: { probabilidad: 0.3, saldo: [6, 24], desde: [40, 260] },
  sinVacaciones: ["EMP-001"],
  tareasPorSemana: [6, 12],
  tareas: {
    prefijo: "ENF-",
    titulos: [
      (n) => `Completar el registro de enfermería de la habitación ${(n % 40) + 101}`,
      (n) => `Reponer el carro de paro del ${PISOS[n % 4]}`,
      (n) => `Verificar el inventario de medicación del ${PISOS[(n + 1) % 4]}`,
      (n) => `Preparar el material estéril de la cirugía ${n}`,
      (n) => `Entregar el informe de pase de turno ${n}`,
      (n) => `Controlar el vencimiento de insumos del depósito ${(n % 3) + 1}`,
      (n) => `Revisar el equipo de monitoreo de la cama ${(n % 12) + 1}`,
      () => "Actualizar la planilla de cobertura de turnos",
    ],
    origenes: ["Sistema de enfermería", "Sistema de enfermería", "Farmacia", "Esterilización"],
    ref: (id) => `https://tareas.example/enfermeria/${id}`,
  },
};

export default perfil;
