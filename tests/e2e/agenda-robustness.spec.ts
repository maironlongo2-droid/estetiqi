import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

// Robustez do carregamento dos dados do formulário de agendamento (clientes,
// procedimentos e profissionais). Quando uma dessas APIs falha, a Agenda deve
// exibir uma mensagem clara e permitir tentar novamente, sem apresentar a falha
// como se fosse uma lista vazia legítima.
const failingEndpoints = [
  { label: "procedimentos", pattern: "**/api/procedures*" },
  { label: "clientes", pattern: "**/api/clients*" },
  { label: "profissionais", pattern: "**/api/professionals" },
];

for (const { label, pattern } of failingEndpoints) {
  test(`agenda trata falha em ${label} e permite tentar novamente`, async ({
    page,
  }) => {
    await page.goto("/login");
    await clerk.signIn({
      emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
      page,
    });

    let failing = true;
    await page.route(pattern, async (route) => {
      if (!failing) {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Falha simulada." }),
      });
    });

    await page.goto("/app/agenda");

    // A falha aparece como erro explícito (fora do <main> fica o toast, que não
    // deve ser confundido). Escopar em <main> garante o banner da tela.
    const banner = page
      .locator("main")
      .getByRole("alert")
      .filter({ hasText: "Falha simulada." });
    await expect(banner).toBeVisible();

    // É possível tentar novamente reutilizando o mecanismo de carregamento.
    const retry = banner.getByRole("button", { name: "Tentar novamente" });
    await expect(retry).toBeVisible();

    // Ao liberar a API, a nova tentativa limpa o erro e libera o formulário.
    failing = false;
    await retry.click();

    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Novo agendamento" })
    ).toBeEnabled();
  });
}
