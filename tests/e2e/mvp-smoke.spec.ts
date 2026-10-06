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
