import { test, expect, type Page } from "@playwright/test";
import type { EmpresaDTO, SesionDemoDTO, UsuarioDemoDTO } from "../src/shared/contracts";
import { empresaMock } from "../src/shared/mocks";
import { USUARIOS_DEMO } from "../src/server/http/permisos-demo";
import { datos } from "./demo";

// Three demo companies, each its own database: the entry picks the company before the profile,
// the profiles are that company's, and the demo strip switches company keeping the profile.

const RUTAS: EmpresaDTO = {
  id: "rutas",
  nombre: "Rutas del Plata",
  rubro: "Transporte y logística",
  descripcion: "Choferes de larga distancia, reparto urbano y depósito.",
};
const SALUD: EmpresaDTO = {
  id: "salud",
  nombre: "Sanatorio del Parque",
  rubro: "Salud",
  descripcion: "Enfermería por turnos, guardia y servicios de internación.",
};
const EMPRESAS = [empresaMock, RUTAS, SALUD];
const liderDe = (equipo: string): UsuarioDemoDTO => ({
  userId: "demo-tl-01",
  nombre: `Team Lead, ${equipo}`,
  rol: "TEAM_LEAD",
  employeeId: "TL-01",
  teamId: "EQ-01",
});
const USUARIOS: Record<string, UsuarioDemoDTO[]> = {
  conecta: [...USUARIOS_DEMO],
  rutas: [USUARIOS_DEMO[0], USUARIOS_DEMO[1], liderDe("Larga distancia"), USUARIOS_DEMO.at(-1)!],
  salud: [USUARIOS_DEMO[0], USUARIOS_DEMO[1], liderDe("Guardia"), USUARIOS_DEMO.at(-1)!],
};

/** The session API of a server with three companies; records every sign-in. */
async function tresEmpresas(page: Page) {
  const ingresos: { userId: string; empresa?: string }[] = [];
  const lecturas: (string | null)[] = [];
  let sesion: { userId: string; empresa: string } | null = null;
  await page.route(datos, (route) => route.fulfill({ json: {} }));
  await page.route(
    (url) => url.pathname === "/api/demo/sesion",
    (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        ingresos.push(body);
        sesion = { userId: body.userId, empresa: body.empresa ?? "conecta" };
        return route.fulfill({
          json: { usuario: USUARIOS[sesion.empresa].find((u) => u.userId === body.userId) },
        });
      }
      const pedida = new URL(request.url()).searchParams.get("empresa");
      lecturas.push(pedida);
      const empresa = pedida ?? sesion?.empresa ?? "conecta";
      return route.fulfill({
        json: {
          empresa: EMPRESAS.find((e) => e.id === empresa)!,
          empresas: EMPRESAS,
          usuario:
            sesion?.empresa === empresa
              ? (USUARIOS[empresa].find((u) => u.userId === sesion!.userId) ?? null)
              : null,
          usuarios: USUARIOS[empresa],
          correo: "SIMULADO",
        } satisfies SesionDemoDTO,
      });
    },
  );
  return { ingresos, lecturas };
}

test("Empresas: se elige la empresa, después un perfil de esa empresa, y el ingreso la lleva", async ({ page }) => {
  const { ingresos, lecturas } = await tresEmpresas(page);
  await page.goto("/");
  const empresas = page.getByRole("region", { name: "Empresa" });
  await expect(empresas.getByRole("button")).toHaveCount(3);
  await expect(empresas.getByRole("button", { name: /Conecta Servicios Técnicos/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: /Team Lead, Célula ficticia 1/ })).toBeVisible();

  await empresas.getByRole("button", { name: /Rutas del Plata.*Transporte y logística/ }).click();
  await expect(
    page.getByRole("heading", { name: "Seleccione un perfil para ingresar a Rutas del Plata" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Team Lead, Larga distancia/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Célula ficticia/ })).toHaveCount(0);
  expect(lecturas).toContain("rutas");

  await page.getByRole("button", { name: /Team Lead, Larga distancia/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  expect(ingresos).toEqual([{ userId: "demo-tl-01", empresa: "rutas" }]);
  await expect(page.getByRole("complementary")).toContainText("Rutas del Plata");
});

test("Empresas: la franja de demostración cambia de empresa con el mismo perfil", async ({ page }) => {
  const { ingresos } = await tresEmpresas(page);
  await page.goto("/");
  await page.getByRole("button", { name: /^RR\. HH\./ }).click();
  await expect(page).toHaveURL(/\/home$/);
  const empresa = page.getByRole("combobox", { name: "Empresa de la demostración" });
  await expect(empresa).toHaveValue("conecta");
  await empresa.selectOption("salud");
  await expect(page.getByRole("complementary")).toContainText("Sanatorio del Parque");
  expect(ingresos.at(-1)).toEqual({ userId: "demo-rrhh", empresa: "salud" });
  await expect(page.getByRole("combobox", { name: "Empresa de la demostración" })).toHaveValue("salud");
});

test("Empresas: con una sola empresa no hay paso de empresa ni selector", async ({ page }) => {
  await page.route(datos, (route) => route.fulfill({ json: {} }));
  await page.route(
    (url) => url.pathname === "/api/demo/sesion",
    (route) =>
      route.fulfill({
        json: {
          empresa: empresaMock,
          empresas: [empresaMock],
          usuario: null,
          usuarios: USUARIOS_DEMO,
          correo: "SIMULADO",
        } satisfies SesionDemoDTO,
      }),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Seleccione un perfil para ingresar" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Empresa" })).toHaveCount(0);
});
