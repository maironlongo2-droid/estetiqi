import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("CRUD básico de cliente", async ({ page }) => {
  await page.goto("/login");

  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  await page.goto("/app/clientes");

  await expect(
    page.getByRole("heading", { name: "Clientes" })
  ).toBeVisible();

  const unique = Date.now();
  const clientName = `E2E Cliente ${unique}`;
  const clientEmail = `e2e-${unique}@example.com`;
  const clientPhone = `(21) 9${String(unique).slice(-8)}`;

  let clientCreated = false;

  try {
    await page.getByRole("button", { name: "Novo cliente" }).click();

    await page.getByLabel("Nome *").fill(clientName);
    await page.getByLabel("Telefone").fill(clientPhone);
    await page.getByLabel("E-mail").fill(clientEmail);

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/clients") &&
        response.request().method() === "POST"
    );

    await page
      .getByRole("button", { name: "Cadastrar cliente" })
      .click();

    const createResponse = await createResponsePromise;

    console.log("POST /api/clients:", createResponse.status());

    expect(createResponse.ok()).toBeTruthy();
    clientCreated = true;

    await expect(page.getByText(clientName)).toBeVisible();

    // Captura a resposta da API do perfil.
    const profileResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/clients/") &&
        response.url().endsWith("/profile") &&
        response.request().method() === "GET"
    );

    await page.getByRole("link", { name: clientName }).click();

    const profileResponse = await profileResponsePromise;

    console.log(
      "GET /api/clients/[id]/profile:",
      profileResponse.status()
    );

    console.log(
      "Resposta do perfil:",
      await profileResponse.text()
    );

    await expect(page).toHaveURL(/\/app\/clientes\/[^/]+$/);

    await expect(
      page.getByRole("heading", { name: clientName })
    ).toBeVisible();

    await page.goto("/app/clientes");

    await expect(page.getByText(clientName)).toBeVisible();

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(clientName);
      await dialog.accept();
    });

    await page
      .getByText(clientName)
      .locator(
        "xpath=ancestor::div[contains(@class,'justify-between')]"
      )
      .getByRole("button", { name: "Excluir" })
      .click();

    await expect(page.getByText(clientName)).not.toBeVisible();
  } finally {
    if (clientCreated) {
      const links = page.getByRole("link", { name: clientName });

      if (await links.count()) {
        const href = await links.first().getAttribute("href");

        if (href) {
          const clientId = href.split("/").pop();

          if (clientId) {
            await page.request.delete(`/api/clients/${clientId}`);
          }
        }
      }
    }
  }
});
