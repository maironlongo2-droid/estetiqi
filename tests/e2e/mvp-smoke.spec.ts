import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

const pages = [
  "/app",
  "/app/clientes",
  "/app/agenda",
  "/app/procedimentos",
  "/app/automacoes",
  "/app/financeiro",
  "/app/ia",
  "/app/inteligencia",
  "/app/onboarding",
];

test("smoke geral das páginas do MVP", async ({ page }) => {
  await page.goto("/login");

  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  for (const path of pages) {
    const response = await page.goto(path);

    console.log(
      `${path} -> HTTP ${response?.status() ?? "sem resposta"}`
    );

    expect(response, `Sem resposta para ${path}`).toBeTruthy();
    expect(
      response!.status(),
      `Erro HTTP em ${path}`
    ).toBeLessThan(400);

    await expect(page.locator("body")).not.toContainText(
      "Application error"
    );
    await expect(page.locator("body")).not.toContainText(
      "Internal Server Error"
    );
  }
});

test("manifesto PWA e telas principais cabem no mobile", async ({ page }) => {
  await page.goto("/login");
  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.start_url).toBe("/app");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons).toContainEqual(
    expect.objectContaining({ src: "/icon.svg", sizes: "any" })
  );
  expect((await page.request.get("/icon.svg")).ok()).toBeTruthy();

  const unique = Date.now();
  const clientResponse = await page.request.post("/api/clients", {
    data: {
      name: `E2E Mobile ${unique}`,
      phone: `+552199${String(unique).slice(-8)}`,
      email: `e2e-mobile-${unique}@example.com`,
      status: "active",
    },
  });
  expect(clientResponse.status()).toBe(201);
  const client = (await clientResponse.json()).client;

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/app",
    "/app/clientes",
    `/app/clientes/${client.id}`,
    "/app/agenda",
    "/app/financeiro",
    "/app/inteligencia",
    "/app/automacoes",
    "/app/procedimentos",
    "/app/profissionais",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(
      dimensions.content,
      `Conteúdo horizontalmente maior que a tela em ${path}`
    ).toBeLessThanOrEqual(dimensions.viewport);
  }

  await page.goto("/app/agenda");
  await page.getByRole("button", { name: "Novo agendamento" }).click();
  await expect(
    page.getByRole("heading", { name: "Novo agendamento" })
  ).toBeVisible();
  const appointmentFormDimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(appointmentFormDimensions.content).toBeLessThanOrEqual(
    appointmentFormDimensions.viewport
  );

  await page.goto("/app");
  const mainNavigation = page.getByRole("navigation", {
    name: "Navegação principal",
  });
  const primaryNavigationHrefs = await mainNavigation
    .locator("a")
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute("href"))
    );
  // No celular, Inteligência e Automações ficam no menu "Mais opções".
  expect(primaryNavigationHrefs).toEqual([
    "/app",
    "/app/clientes",
    "/app/agenda",
    "/app/financeiro",
  ]);
  for (const label of ["Início", "Clientes", "Agenda", "Financeiro"]) {
    await expect(
      mainNavigation.getByRole("link", { name: label, exact: true })
    ).toBeVisible();
  }
  const navigationBoxes = (
    await Promise.all(
      (await mainNavigation.getByRole("link").all()).map((link) =>
        link.boundingBox()
      )
    )
  ).filter((box) => box !== null);
  expect(navigationBoxes).toHaveLength(4);
  for (let index = 1; index < navigationBoxes.length; index += 1) {
    const previous = navigationBoxes[index - 1]!;
    expect(
      navigationBoxes[index]!.x,
      "Itens da navegação não podem se sobrepor"
    ).toBeGreaterThanOrEqual(previous.x + previous.width - 1);
  }
  const navigationDimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(navigationDimensions.content).toBeLessThanOrEqual(
    navigationDimensions.viewport
  );
  await page.getByRole("button", { name: "Mais opções" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Profissionais" })
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Procedimentos" })
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Inteligência" })
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Automações" })
  ).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sair" })).toBeVisible();
});
