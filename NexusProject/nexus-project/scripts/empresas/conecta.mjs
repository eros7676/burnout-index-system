// Conecta Servicios Técnicos: field maintenance, fiber networks and a technical help desk.
// Office hours Monday to Friday; overload is weekend call-outs and long days. The index rules are
// the product defaults (v1).

const SEDES = ["Norte", "Sur", "Centro", "Este", "Oeste"];
const TECNICOS =
  "Sofía Romero|Matías Giménez|Valentina Sosa|Nicolás Herrera|Camila Acosta|Federico Medina|Agustina Ríos|Lucas Domínguez|Florencia Navarro|Tomás Ojeda|Julieta Cabrera|Santiago Molina|Micaela Ledesma|Ezequiel Vera|Rocío Quiroga|Gonzalo Suárez|Daniela Ibarra|Facundo Correa|Paula Villalba|Leandro Godoy|Antonella Figueroa|Maximiliano Ruiz|Brenda Castro|Hernán Ponce|Milagros Vega|Damián Arias|Lorena Toledo|Ignacio Peralta|Natalia Coronel|Emiliano Rojas|Belén Morales|Cristian Luna|Victoria Ortiz|Pablo Maldonado|Gabriela Funes|Sebastián Carrizo|Melina Paredes|Franco Bustos|Romina Sánchez|Alejandro Moyano|Eugenia Blanco|Rodrigo Vázquez|Celeste Escobar|Mauricio Lucero|Andrea Gallardo".split(
    "|",
  );

const perfil = {
  id: "conecta",
  semilla: 20261107,
  equipos: {
    "EQ-01": "Mantenimiento Zona Norte",
    "EQ-02": "Mantenimiento Zona Sur",
    "EQ-03": "Redes y Fibra Óptica",
    "EQ-04": "Mesa de Ayuda Técnica",
  },
  personas: {
    "GER-01": "Mariana Ferreyra",
    "TL-01": "Javier Benítez",
    "TL-02": "Carolina Méndez",
    "TL-03": "Martín Aguirre",
    "TL-04": "Luciana Paz",
    ...Object.fromEntries(TECNICOS.map((n, i) => [`EMP-${String(i + 1).padStart(3, "0")}`, n])),
  },
  reglas: {
    weights: { HE: 0.3, DS: 0.3, CT: 0.25, VP: 0.15 },
    thresholds: { HE: 8, DS: 6, CT: 0.35, VP: 10 },
    mediumLimit: 40,
    highLimit: 70,
    minExceededFactors: 2,
  },
  /** Monday to Friday, 8 hours. */
  turno: () => (d) => (d % 7 < 5 ? 8 : 0),
  /** Sofía (EMP-001) is the sustained case; a few rise, one spikes; Redes runs hot. */
  carga({ id, equipo, indice }, { azar }) {
    if (id === "EMP-001") return () => 0.9;
    if (indice % 11 === 3) return (s) => (s >= 5 ? 0.95 : 0.25 + s * 0.05);
    if (indice % 13 === 5) return (s) => (s === 4 ? 0.9 : 0.3);
    const base = equipo === "EQ-03" ? 0.55 : id.startsWith("TL-") ? 0.5 : 0.25;
    return () => Math.min(1, Math.max(0, base + (azar() - 0.5) * 0.3));
  },
  extraPorDia: 3,
  descansoTrabajado: 0.95,
  horasDescanso: 6,
  licencia: 0.015,
  vacaciones: { probabilidad: 0.3, saldo: [2, 16], desde: [20, 140] },
  sinVacaciones: ["EMP-001"],
  tareasPorSemana: [6, 12],
  tareas: {
    prefijo: "OPS-",
    titulos: [
      (n) => `Revisar el sistema de climatización de la sucursal ${SEDES[n % 5]}`,
      (n) => `Reemplazar el router de acceso del nodo ${n}`,
      (n) => `Relevar el cableado estructurado del depósito ${SEDES[n % 5]}`,
      (n) => `Programar el mantenimiento preventivo del UPS ${n}`,
      (n) => `Instalar el punto de acceso inalámbrico del piso ${(n % 6) + 1}`,
      (n) => `Actualizar el firmware del controlador ${n}`,
      (n) => `Documentar el cierre de la visita técnica ${n}`,
      (n) => `Inspeccionar el grupo electrógeno de la planta ${(n % 9) + 1}`,
      (n) => `Medir la potencia óptica del enlace ${n}`,
      (n) => `Cerrar el reclamo de garantía ${n}`,
      (n) => `Reprogramar la visita pendiente del cliente ${n}`,
      () => "Revisar las alarmas pendientes del sistema de monitoreo",
    ],
    origenes: ["Mesa de ayuda", "Mesa de ayuda", "Planificador de visitas", "Gestión de mantenimiento"],
    ref: (id) => `https://tareas.example/ordenes/${id}`,
  },
};

export default perfil;
