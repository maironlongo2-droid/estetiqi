import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("fluxo básico de procedimentos", async ({ page }) => {
  await page.goto("/login");

  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const unique = Date.now();
  const name = `Procedimento E2E ${unique}`;
  const editedName = `Procedimento Editado ${unique}`;

  await page.goto("/app/procedimentos");

  await page.getByRole("button", { name: "Novo procedimento" }).click();

  await page
    .getByPlaceholder("Ex.: Limpeza de pele")
    .fill(name);

  await page
    .getByPlaceholder("Descrição do procedimento")
    .fill("Procedimento criado pelo teste E2E");

  await page.getByPlaceholder("150.00").fill("150");
  await page.getByPlaceholder("60").fill("60");

  await page
    .getByRole("button", { name: "Cadastrar procedimento" })
    .click();

  await expect(page.getByText(name, { exact: true })).toBeVisible();

  const procedureCard = page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor::div[.//button[normalize-space()='Editar']][1]");

  await procedureCard
    .getByRole("button", { name: "Editar", exact: true })
    .click();

  await page
    .getByPlaceholder("Ex.: Limpeza de pele")
    .fill(editedName);

  await page
    .getByRole("button", { name: "Salvar alterações" })
    .click();

  await expect(page.getByText(editedName, { exact: true })).toBeVisible();

  const editedCard = page
    .getByText(editedName, { exact: true })
    .locator("xpath=ancestor::div[.//button[normalize-space()='Excluir']][1]");

  page.once("dialog", dialog => dialog.accept());

  await editedCard
    .getByRole("button", { name: "Excluir", exact: true })
    .click();

  await expect(
    page.getByText(editedName, { exact: true })
  ).not.toBeVisible();
});
