// Rutas del Plata: freight transport, long-distance and urban delivery drivers, and a warehouse.
// The normal week is the freight drivers' agreement as the ILO study reads it (CCT 40/89: 44 h a
// week; Monday to Friday 8 h and Saturday until 13 h, weekly rest from then, LCT art. 204).
// Overload is working the Sunday rest and long days on the road, so overtime and the streak weigh
// more than tasks (trips and deliveries), and overtime counts sooner than in the product default.
// Sources: Docs/research/2026-11-07-rubros.md.

const CIUDADES = ["Rosario", "Córdoba", "Mar del Plata", "Bahía Blanca", "Mendoza", "Santa Fe"];
const PERSONAL =
  "Diego Alvarez|Marcelo Sosa|Walter Giménez|Claudio Romero|Ramiro Benítez|Gustavo Paz|Jorge Ledesma|Ariel Medina|Raúl Cabrera|Sergio Díaz|Fernando Acosta|Hugo Ríos|Oscar Villalba|Daniel Ojeda|Héctor Molina|Rubén Herrera|Luis Quiroga|Javier Correa|Carlos Funes|Miguel Arias|Patricia Gómez|Silvina Ruiz|Néstor Godoy|Darío Castro|Alberto Ponce|Mónica Vega|Ricardo Toledo|Gabriel Peralta|Adrián Coronel|Juan Rojas|Graciela Morales|Martín Luna|Eduardo Ortiz|Cecilia Maldonado|Mariano Figueroa|Alejandra Carrizo|Omar Paredes|Fabián Bustos|Liliana Sánchez|Roberto Moyano|Verónica Blanco|Esteban Vázquez|Laura Escobar|Pedro Lucero|Silvia Gallardo".split(
    "|",
  );

const perfil = {
  id: "rutas",
  semilla: 20261108,
  equipos: {
    "EQ-01": "Larga Distancia",
    "EQ-02": "Reparto Urbano",
    "EQ-03": "Depósito y Carga",
    "EQ-04": "Programación de Tráfico",
  },
  personas: {
    "GER-01": "Alicia Fernández",
    "TL-01": "Horacio Gutiérrez",
    "TL-02": "Norma Ibáñez",
    "TL-03": "Ernesto Rivas",
    "TL-04": "Susana Benavídez",
    ...Object.fromEntries(PERSONAL.map((n, i) => [`EMP-${String(i + 1).padStart(3, "0")}`, n])),
  },
  reglas: {
    weights: { HE: 0.35, DS: 0.35, CT: 0.15, VP: 0.15 },
    thresholds: { HE: 6, DS: 6, CT: 0.4, VP: 10 },
    mediumLimit: 40,
    highLimit: 70,
    minExceededFactors: 2,
  },
  /** Monday to Friday 8 hours and Saturday 4: 44 hours, rest from Saturday afternoon. */
  turno: () => (d) => (d % 7 < 5 ? 8 : d % 7 === 5 ? 4 : 0),
  /** Diego (EMP-001) drives nearly every Sunday; long distance runs hot; urban delivery peaks late. */
  carga({ id, equipo, indice }, { azar }) {
    if (id === "EMP-001") return () => 1;
    if (indice % 11 === 3) return (s) => (s >= 5 ? 0.95 : 0.25 + s * 0.05);
    const ruido = () => (azar() - 0.5) * 0.3;
    const acotar = (c) => Math.min(1, Math.max(0, c));
    if (equipo === "EQ-01") return () => acotar(0.5 + ruido());
    if (equipo === "EQ-02") return (s) => acotar((s >= 6 ? 0.8 : 0.3) + ruido());
    const base = id.startsWith("TL-") ? 0.45 : 0.2;
    return () => acotar(base + ruido());
  },
  extraPorDia: 3,
  descansoTrabajado: 0.95,
  horasDescanso: 8,
  licencia: 0.012,
  vacaciones: { probabilidad: 0.25, saldo: [4, 20], desde: [30, 200] },
  sinVacaciones: ["EMP-001"],
  tareasPorSemana: [5, 10],
  tareas: {
    prefijo: "VJE-",
    titulos: [
      (n) => `Entregar la carga del remito ${n} en ${CIUDADES[n % 6]}`,
      (n) => `Completar la hoja de ruta del viaje ${n}`,
      (n) => `Registrar la inspección previa del camión ${(n % 30) + 1}`,
      (n) => `Retirar la mercadería del cliente ${n}`,
      (n) => `Cargar los remitos firmados del reparto ${n}`,
      (n) => `Coordinar el turno de descarga en ${CIUDADES[(n + 2) % 6]}`,
      (n) => `Preparar el pedido ${n} para despacho`,
      (n) => `Informar la novedad del viaje ${n}`,
      () => "Revisar los viajes reprogramados de la semana",
    ],
    origenes: ["Sistema de despachos", "Sistema de despachos", "Planificador de rutas", "Mantenimiento de flota"],
    ref: (id) => `https://tareas.example/viajes/${id}`,
  },
};

export default perfil;
