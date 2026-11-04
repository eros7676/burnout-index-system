import { test, expect, type Page } from "@playwright/test";
import { demo, menu, PERSONAS } from "./demo";
import { tareasMocks } from "./tareas-mocks";
import {
  LUNES_ACTUAL,
  organizacion,
  rechazo,
  vistaPrevia,
  type Pedido,
} from "./organizacion-mocks";

// People and teams: the paged list, hire, profile, move, deactivation, teams and the people
// import. Mocked like the other specs (the dataset of ./demo.ts); `organizacion(page)` goes
// after every `demo(...)` because the later route wins.

const lista = (page: Page) => page.getByRole("region", { name: "Personas", exact: true });
const equipo = (page: Page) => page.getByRole("combobox", { name: "Equipo" });
const nivel = (page: Page) => page.getByRole("combobox", { name: "Nivel" });
const estado = (page: Page) => page.getByRole("combobox", { name: "Estado" });
const busqueda = (page: Page) => page.getByRole("searchbox", { name: "Buscar persona" });
const hechos = (page: Page) => page.locator("dl").first();
/** Body of the last write sent to a route. */
const enviado = (pedidos: Pedido[], ruta: string) =>
  pedidos.filter((p) => p.metodo === "POST" && p.ruta === ruta).at(-1)?.cuerpo;
const resumenDeErrores = (page: Page) =>
  page.getByRole("main").getByRole("alert").filter({ hasText: "Revise los campos indicados" });

test("Personas: los filtros, la búsqueda y la semana viajan al servidor, una página por llamada", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  const pedidos: URL[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.pathname === "/api/personas/directorio") pedidos.push(url);
  });
  await page.goto("/employees");
  await expect(lista(page).getByRole("row")).toHaveCount(PERSONAS.length + 1);
  await expect(
    page.getByRole("main").getByRole("status").filter({ hasText: "Personas 1 a" }),
  ).toHaveText("Personas 1 a 8 de 8");
  expect(Object.fromEntries(pedidos[0].searchParams)).toEqual({
    estado: "ACTIVAS",
    orden: "indice",
    page: "1",
    pageSize: "50",
  });

  await equipo(page).selectOption({ label: "Célula ficticia 2" });
  await expect(lista(page).getByRole("rowheader")).toHaveText([
    /^Persona ficticia 002/,
    /^Persona ficticia 004/,
    /^Persona ficticia 005/,
  ]);
  expect(pedidos.at(-1)!.searchParams.get("teamId")).toBe("EQ-02");
  await nivel(page).selectOption({ label: "Alto" });
  await expect(page.getByText("Nadie coincide con estos filtros")).toBeVisible();
  expect(pedidos.at(-1)!.searchParams.get("nivel")).toBe("ALTO");
  await page.getByRole("button", { name: "Limpiar filtros" }).click();
  await expect(lista(page).getByRole("row")).toHaveCount(PERSONAS.length + 1);
  await expect(equipo(page)).toHaveValue("");

  // The search waits for the typing to pause, then matches by legajo too.
  await busqueda(page).fill("EMP-007");
  await expect(lista(page).getByRole("rowheader")).toHaveText([/^Persona ficticia 007/]);
  expect(pedidos.at(-1)!.searchParams.get("q")).toBe("EMP-007");
  await busqueda(page).fill("");
  await expect(lista(page).getByRole("row")).toHaveCount(PERSONAS.length + 1);

  await estado(page).selectOption({ label: "Dadas de baja" });
  await expect(page.getByText("Nadie coincide con estos filtros")).toBeVisible();
  expect(pedidos.at(-1)!.searchParams.get("estado")).toBe("BAJAS");
  await estado(page).selectOption({ label: "Activas" });
  await expect(lista(page).getByRole("row")).toHaveCount(PERSONAS.length + 1);

  // The week selector asks for that week; every row reads it.
  await page.getByRole("combobox", { name: "Semana" }).selectOption("2026-10-05");
  await expect(
    lista(page).getByRole("row").filter({ hasText: "Persona ficticia 006" }),
  ).toContainText("Sin datos");
  expect(pedidos.at(-1)!.searchParams.get("periodStart")).toBe("2026-10-05");
});

test("Personas: las acciones de alta e importación son solo de RR. HH.", async ({ page }) => {
  for (const [usuario, ve] of [
    ["demo-rrhh", true],
    ["demo-gerencia", false],
    ["demo-tl-01", false],
  ] as const) {
    await demo(page, usuario);
    await organizacion(page);
    await page.goto("/employees");
    await expect(page.getByRole("heading", { level: 1, name: "Personas" })).toBeVisible();
    await expect(lista(page)).toBeVisible();
    for (const nombre of ["Nueva persona", "Importar personas"]) {
      const enlace = page.getByRole("link", { name: nombre });
      if (ve) await expect(enlace).toBeVisible();
      else await expect(enlace).toHaveCount(0);
    }
  }
});

test("Nueva persona: el responsable sigue al equipo y al puesto, y el alta envía lo escrito", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const { pedidos } = await organizacion(page);
  await page.goto("/employees/new");
  await expect(page.getByRole("heading", { level: 1, name: "Nueva persona" })).toBeVisible();
  await expect(page.getByLabel("Legajo")).toHaveValue("EMP-009");
  await expect(page.getByLabel("Vigente desde")).toHaveValue(LUNES_ACTUAL);
  await page.getByLabel("Nombre y apellido").fill("Ana Pérez");

  const equipoDelAlta = page.getByLabel("Equipo", { exact: true });
  await equipoDelAlta.selectOption("EQ-01");
  await expect(page.getByLabel("Responsable")).toHaveValue("Team Lead ficticio 1");
  await page.getByLabel("Puesto").selectOption("TEAM_LEAD");
  await expect(page.getByLabel("Responsable")).toHaveValue("Gerente ficticio de Operaciones");
  await page.getByLabel("Puesto").selectOption("GERENCIA");
  await expect(equipoDelAlta).toBeDisabled();
  await expect(page.getByLabel("Responsable")).toHaveValue("No aplica");
  await expect(page.getByLabel("Incluir en la cobertura de la evaluación")).not.toBeChecked();
  await page.getByLabel("Puesto").selectOption("TECNICO");
  await expect(page.getByLabel("Incluir en la cobertura de la evaluación")).toBeChecked();
  await equipoDelAlta.selectOption("EQ-01");

  await page.getByRole("button", { name: "Crear persona" }).click();
  await expect(page).toHaveURL(/\/employees\/EMP-009$/);
  expect(enviado(pedidos, "/api/personas")).toEqual({
    employeeId: "EMP-009",
    nombre: "Ana Pérez",
    tipo: "TECNICO",
    teamId: "EQ-01",
    desde: LUNES_ACTUAL,
    enCobertura: true,
  });
});

test("Nueva persona: el error del servidor aparece en el campo y en el resumen, y el nombre repetido pide confirmar", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const duplicado = "Ya existe una persona con este legajo. Ingrese otro.";
  const { pedidos } = await organizacion(page, (pedido) => {
    if (pedido.metodo !== "POST" || pedido.ruta !== "/api/personas") return undefined;
    const cuerpo = pedido.cuerpo as { employeeId: string; confirmarNombreRepetido?: boolean };
    if (cuerpo.employeeId === "EMP-001")
      return rechazo(422, "VALIDACION_INVALIDA", "Revise los campos indicados.", [
        { campo: "employeeId", codigo: "LEGAJO_DUPLICADO", detalle: duplicado },
      ]);
    if (!cuerpo.confirmarNombreRepetido)
      return rechazo(409, "NOMBRE_REPETIDO", "Ya hay una persona con este nombre.", [
        {
          campo: "nombre",
          codigo: "NOMBRE_REPETIDO",
          detalle: "Ya hay una persona con este nombre.",
        },
      ]);
    return undefined;
  });
  await page.goto("/employees/new");
  await page.getByLabel("Legajo").fill("EMP-001");
  await page.getByLabel("Nombre y apellido").fill("Persona ficticia 001");
  await page.getByLabel("Equipo", { exact: true }).selectOption("EQ-01");
  await page.getByRole("button", { name: "Crear persona" }).click();

  // The summary takes focus and names the failure; the same message sits under its field.
  await expect(resumenDeErrores(page)).toBeFocused();
  await expect(page.getByText(duplicado)).toHaveCount(2);
  await expect(page.getByLabel("Nombre y apellido")).toHaveValue("Persona ficticia 001");
  await resumenDeErrores(page).getByRole("link", { name: duplicado }).click();
  await expect(page.getByLabel("Legajo")).toBeFocused();

  await page.getByLabel("Legajo").fill("EMP-009");
  await page.getByRole("button", { name: "Crear persona" }).click();
  await expect(
    page.getByText("Ya hay una persona con este nombre. Verifique que no sea un duplicado"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Crear de todos modos" }).click();
  await expect(page).toHaveURL(/\/employees\/EMP-009$/);
  expect(enviado(pedidos, "/api/personas")).toMatchObject({
    employeeId: "EMP-009",
    confirmarNombreRepetido: true,
  });
});

test("Ficha: datos clave, historial de asignaciones y acciones solo para RR. HH.", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  // The profile also lists the person's weeks with tasks (SeccionTareas).
  await tareasMocks(page);
  await page.goto("/employees/EMP-001");
  await expect(page.getByRole("heading", { level: 1, name: "Persona ficticia 001" })).toBeVisible();
  await expect(hechos(page)).toContainText("EMP-001");
  await expect(hechos(page)).toContainText("Team Lead ficticio 1");
  await expect(hechos(page)).toContainText("Activa");
  await expect(hechos(page).getByRole("link", { name: "Célula ficticia 1" })).toHaveAttribute(
    "href",
    "/teams/EQ-01",
  );
  const historial = page.getByRole("region", { name: "Asignaciones de Persona ficticia 001" });
  await expect(historial.getByRole("rowheader")).toHaveText(["2 mar 2026", "5 ene 2026"]);
  await expect(historial.getByRole("row").nth(1)).toContainText("Vigente");
  await expect(historial.getByRole("row").nth(1)).toContainText("Cambio de equipo");
  await expect(historial.getByRole("row").nth(2)).toContainText("Alta");
  for (const [nombre, destino] of [
    ["Editar datos", "edit"],
    ["Cambiar equipo o puesto", "move"],
    ["Dar de baja", "deactivate"],
  ])
    await expect(page.getByRole("link", { name: nombre })).toHaveAttribute(
      "href",
      `/employees/EMP-001/${destino}`,
    );
  await expect(page.getByRole("region", { name: "Semanas de Persona ficticia 001" })).toBeVisible();

  // Gerencia reads the same page without the actions that write.
  await demo(page, "demo-gerencia");
  await organizacion(page);
  // The profile also lists the person's weeks with tasks (SeccionTareas).
  await tareasMocks(page);
  await page.goto("/employees/EMP-001");
  await expect(page.getByRole("heading", { level: 1, name: "Persona ficticia 001" })).toBeVisible();
  for (const nombre of ["Editar datos", "Cambiar equipo o puesto", "Dar de baja"])
    await expect(page.getByRole("link", { name: nombre })).toHaveCount(0);
});

test("Cambio de equipo: abre una asignación desde un lunes; la corrección no lleva fecha y exige el motivo", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const { pedidos } = await organizacion(page, (pedido) => {
    const cuerpo = pedido.cuerpo as { motivo?: string; comentario?: string };
    return pedido.ruta.endsWith("/asignaciones") &&
      cuerpo.motivo === "CORRECCION" &&
      !cuerpo.comentario
      ? rechazo(422, "VALIDACION_INVALIDA", "Revise los campos indicados.", [
          {
            campo: "comentario",
            codigo: "JUSTIFICACION_OBLIGATORIA",
            detalle: "Indique el motivo de la corrección, que queda registrado en la auditoría.",
          },
        ])
      : undefined;
  });
  await page.goto("/employees/EMP-001/move");
  await expect(
    page.getByRole("heading", { level: 1, name: "Cambiar equipo o puesto" }),
  ).toBeVisible();
  await page.getByLabel("Equipo", { exact: true }).selectOption("EQ-02");
  await page.getByRole("button", { name: "Guardar cambio" }).click();
  await expect(page).toHaveURL(/\/employees\/EMP-001$/);
  expect(enviado(pedidos, "/api/personas/EMP-001/asignaciones")).toEqual({
    motivo: "CAMBIO_EQUIPO",
    desde: LUNES_ACTUAL,
    tipo: "TECNICO",
    teamId: "EQ-02",
    enCobertura: true,
  });

  await page.goto("/employees/EMP-001/move");
  await page.getByLabel("Motivo del cambio").selectOption("CORRECCION");
  await expect(page.getByLabel("Vigente desde")).toHaveCount(0);
  await page.getByLabel("Equipo", { exact: true }).selectOption("EQ-02");
  await page.getByRole("button", { name: "Guardar cambio" }).click();
  await expect(
    resumenDeErrores(page).getByRole("link", { name: /Indique el motivo de la corrección/ }),
  ).toBeVisible();
  await page.getByLabel("Motivo de la corrección").fill("Equipo cargado por error");
  await page.getByRole("button", { name: "Guardar cambio" }).click();
  await expect(page).toHaveURL(/\/employees\/EMP-001$/);
  expect(enviado(pedidos, "/api/personas/EMP-001/asignaciones")).toEqual({
    motivo: "CORRECCION",
    tipo: "TECNICO",
    teamId: "EQ-02",
    enCobertura: true,
    comentario: "Equipo cargado por error",
  });
});

test("Baja: pide fecha y justificación, las envía y vuelve a la ficha", async ({ page }) => {
  await demo(page, "demo-rrhh");
  const { pedidos } = await organizacion(page);
  await page.goto("/employees/EMP-001/deactivate");
  await expect(page.getByRole("heading", { level: 1, name: "Dar de baja" })).toBeVisible();
  await expect(page.getByText("No se elimina ningún dato.")).toBeVisible();
  await page.getByLabel("Fecha de baja").fill("2026-11-02");
  await page.getByLabel("Justificación").fill("Renuncia");
  await page.getByRole("button", { name: "Dar de baja a la persona" }).click();
  await expect(page).toHaveURL(/\/employees\/EMP-001$/);
  expect(enviado(pedidos, "/api/personas/EMP-001/baja")).toEqual({
    fechaBaja: "2026-11-02",
    justificacion: "Renuncia",
  });
});

test("Equipos: cada fila abre su equipo y los grupos pequeños no muestran agregados", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  await organizacion(page);
  await page.goto("/teams");
  const tabla = page.getByRole("table");
  await expect(
    tabla.getByRole("link", { name: "Célula ficticia 1", exact: true }),
  ).toHaveAttribute("href", "/teams/EQ-01");
  await expect(tabla).toContainText("Grupo demasiado pequeño para mostrar.");
  await expect(tabla).toContainText("Oculto para proteger a un grupo más pequeño.");
  await expect(page.getByRole("link", { name: "Nuevo equipo" })).toHaveAttribute(
    "href",
    "/teams/new",
  );

  await estado(page).selectOption({ label: "Desactivados" });
  await expect(tabla.getByRole("row").filter({ hasText: "Célula ficticia 9" })).toContainText(
    "Desactivado",
  );
  await estado(page).selectOption({ label: "Activos" });

  await tabla.getByRole("link", { name: "Célula ficticia 1", exact: true }).click();
  await expect(page).toHaveURL(/\/teams\/EQ-01$/);
  await expect(page.getByRole("heading", { level: 1, name: "Célula ficticia 1" })).toBeVisible();
  await expect(hechos(page)).toContainText("Team Lead ficticio 1");
  await expect(hechos(page)).toContainText("Gerente ficticio de Operaciones");
  await expect(hechos(page)).toContainText("No disponible");
  await expect(page.getByRole("status").filter({ hasText: "Oculto para proteger a un grupo más pequeño." })).toBeVisible();
  const integrantes = page.getByRole("region", { name: "Integrantes de Célula ficticia 1" });
  await expect(integrantes.getByRole("rowheader")).toHaveCount(5);
  for (const [nombre, destino] of [
    ["Editar equipo", "edit"],
    ["Cambiar líder", "lead"],
    ["Dar de baja", "deactivate"],
  ])
    await expect(page.getByRole("link", { name: nombre })).toHaveAttribute(
      "href",
      `/teams/EQ-01/${destino}`,
    );
});

test("Equipos: nuevo equipo, cambio de líder y desactivación envían lo elegido", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  const { pedidos } = await organizacion(page, (pedido) =>
    pedido.ruta === "/api/equipos/EQ-02/baja"
      ? rechazo(
          409,
          "CONFLICTO",
          "El equipo tiene 3 personas activas. Cámbielas de equipo antes de desactivarlo.",
          [
            {
              campo: "justificacion",
              codigo: "EQUIPO_CON_PERSONAS",
              detalle: "El equipo todavía tiene personas activas.",
            },
          ],
        )
      : undefined,
  );

  await page.goto("/teams/new");
  await expect(page.getByLabel("Código")).toHaveValue("EQ-10");
  await page.getByLabel("Nombre del equipo").fill("Célula ficticia 10");
  await page.getByLabel("Líder (opcional)").selectOption("TL-02");
  await page.getByRole("button", { name: "Crear equipo" }).click();
  await expect(page).toHaveURL(/\/teams\/EQ-10$/);
  expect(enviado(pedidos, "/api/equipos")).toEqual({
    teamId: "EQ-10",
    nombre: "Célula ficticia 10",
    liderId: "TL-02",
    gerenteId: null,
  });

  await page.goto("/teams/EQ-01/lead");
  await expect(
    page.getByLabel("Líder", { exact: true }).locator("option", { hasText: "Team Lead ficticio 1" }),
  ).toHaveCount(0);
  await page.getByLabel("Líder", { exact: true }).selectOption("TL-02");
  await page.getByRole("button", { name: "Cambiar líder" }).click();
  await expect(page).toHaveURL(/\/teams\/EQ-01$/);
  expect(enviado(pedidos, "/api/equipos/EQ-01/lider")).toEqual({ liderId: "TL-02" });

  // A team with people cannot be deactivated: the page says why and disables the submit.
  await page.goto("/teams/EQ-02/deactivate");
  await expect(page.getByText("El equipo tiene 3 personas activas.")).toBeVisible();
  await page.getByLabel("Justificación").fill("Reorganización");
  await expect(page.getByRole("button", { name: "Dar de baja el equipo" })).toBeDisabled();
  expect(enviado(pedidos, "/api/equipos/EQ-02/baja")).toBeUndefined();
});

test("Importar personas: plantilla, vista previa, confirmación y archivo rechazado", async ({
  page,
}) => {
  await demo(page, "demo-rrhh");
  let rechazado = false;
  const { pedidos } = await organizacion(page, (pedido) =>
    rechazado && pedido.ruta.endsWith("/validar")
      ? {
          status: 200,
          json: vistaPrevia([
            {
              fila: 3,
              campo: "team_id",
              codigo: "EQUIPO_INEXISTENTE",
              detalle: "El equipo seleccionado no existe.",
            },
          ]),
        }
      : undefined,
  );
  await page.goto("/employees/import");
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar plantilla" }).click(),
  ]);
  expect(descarga.suggestedFilename()).toBe("personas-v1.csv");

  const csv = "employee_id,nombre,tipo,team_id\nEMP-009,Persona ficticia 009,TECNICO,EQ-01\n";
  const archivo = { name: "personas.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };
  await expect(page.getByRole("button", { name: "Validar archivo" })).toBeDisabled();
  await page.getByLabel("Archivo CSV").setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar archivo" }).click();
  const previa = page.getByRole("region", { name: "Primeras personas nuevas" });
  await expect(previa.getByRole("row")).toHaveCount(3);
  await expect(previa).toContainText("EMP-010");
  await page.getByRole("button", { name: "Confirmar importación de 2 personas" }).click();
  await expect(page.getByText("Se crearon 2 personas y se omitió 1 ya registrada.")).toBeVisible();
  expect(pedidos.map((p) => p.ruta)).toEqual([
    "/api/personas/importacion/validar",
    "/api/personas/importacion/confirmar",
  ]);
  await expect(page.getByRole("link", { name: "Ver personas" })).toHaveAttribute(
    "href",
    "/employees",
  );

  // A rejected file writes nothing: the errors name the row and the column, and there is no confirm.
  rechazado = true;
  await page.getByRole("button", { name: "Importar otro archivo" }).click();
  await page.getByLabel("Archivo CSV").setInputFiles(archivo);
  await page.getByRole("button", { name: "Validar archivo" }).click();
  await expect(page.getByText("El archivo tiene 1 error.")).toBeVisible();
  const errores = page.getByRole("region", { name: "Errores del archivo" });
  await expect(errores.getByRole("row").nth(1)).toContainText("3");
  await expect(errores.getByRole("row").nth(1)).toContainText("team_id");
  await expect(errores.getByRole("row").nth(1)).toContainText(
    "El equipo seleccionado no existe.",
  );
  await expect(page.getByRole("button", { name: /Confirmar importación/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cargar otro archivo" })).toBeVisible();
});

test("Permisos: Gerencia y Team Lead no abren las pantallas que escriben ni otro equipo", async ({
  page,
}) => {
  for (const usuario of ["demo-gerencia", "demo-tl-01"] as const) {
    await demo(page, usuario);
    await organizacion(page);
    for (const ruta of [
      "/employees/new",
      "/employees/import",
      "/employees/EMP-001/edit",
      "/teams/new",
      "/teams/EQ-01/lead",
    ]) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/home$/);
    }
  }
  await demo(page, "demo-tl-01");
  await organizacion(page);
  await page.goto("/teams/EQ-02");
  await expect(page).toHaveURL(/\/home$/);
});

test("Permisos: el Team Lead abre la página de su equipo desde «Mi equipo»", async ({ page }) => {
  await demo(page, "demo-tl-01");
  await organizacion(page);
  await page.goto("/home");
  const enlace = menu(page).getByRole("link", { name: "Mi equipo", exact: true });
  await expect(enlace).toHaveAttribute("href", "/teams/EQ-01");
  await enlace.click();
  await expect(page).toHaveURL(/\/teams\/EQ-01$/);
  await expect(page.getByRole("heading", { level: 1, name: "Célula ficticia 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cambiar líder" })).toHaveCount(0);
  // Another team's page stays closed to them.
  await page.goto("/teams/EQ-02");
  await expect(page).toHaveURL(/\/home$/);
});
