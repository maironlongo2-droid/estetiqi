import { expect, test } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("calculadora de preços estima custos, taxas e margem", async ({ page }) => {
  await page.goto("/login");
  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });
  await page.goto("/app/calculadora");

  await expect(
    page.getByRole("heading", { name: "Calculadora de preços" })
  ).toBeVisible();

  const materialsInput = page.getByLabel("Materiais e produtos usados");
  await materialsInput.fill("0");
  await materialsInput.press("ArrowUp");
  await expect(materialsInput).toHaveValue("1");
  await materialsInput.press("ArrowDown");
  await expect(materialsInput).toHaveValue("0");
  await materialsInput.press("Control+A");
  await materialsInput.pressSequentially("45");
  await expect(materialsInput).toHaveValue("45");

  await page.getByLabel("Materiais e produtos usados").fill("20");
  await page.getByLabel("Valor do seu trabalho").fill("50");
  await page.getByLabel("Parte das despesas do negócio").fill("30");
  await page.getByLabel("Taxas sobre a venda (%)").fill("5");
  await page.getByLabel("Margem de lucro desejada (%)").fill("25");

  await expect(page.getByText("R$ 100,00")).toBeVisible();
  await expect(page.getByText("R$ 105,26")).toBeVisible();
  await expect(page.getByText("R$ 142,86")).toBeVisible();
  await expect(page.getByText("R$ 35,71")).toBeVisible();

  await page.getByLabel("Margem de lucro desejada (%)").fill("95");
  await expect(
    page.getByText("A soma das taxas e da margem desejada precisa ser menor que 100% para calcular um preço.")
  ).toBeVisible();
});
