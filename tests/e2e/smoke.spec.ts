import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

const pages = [
  ["/app", "Dashboard"],
  ["/app/clientes", "Clientes"],
  ["/app/agenda", "Agenda"],
  ["/app/procedimentos", "Procedimentos"],
  ["/app/automacoes", "Automações"],
  ["/app/financeiro", "Financeiro"],
  ["/app/ia", "IA"],
  ["/app/inteligencia", "Inteligência"],
  ["/app/onboarding", "Onboarding"],
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/login");

  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });
});

for (const [path, name] of pages) {
  test(`acesso autenticado: ${name}`, async ({ page }) => {
    await page.goto(path);

    await expect(page).not.toHaveURL(/sign-in|\/login/);
    await expect(page).toHaveURL(new RegExp(path.replace("/", "\\/")));
  });
}

test("API de sessão autenticada", async ({ page }) => {
  const response = await page.request.get("/api/auth/me");

  expect(response.ok()).toBeTruthy();
});
