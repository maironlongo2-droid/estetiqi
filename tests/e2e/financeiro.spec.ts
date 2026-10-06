import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("fluxo de registro de pagamento", async ({ page }) => {
  await page.goto("/login");

  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const unique = Date.now();
  const clientName = `Cliente Financeiro E2E ${unique}`;
  const procedureName = `Procedimento Financeiro E2E ${unique}`;

  const clientResponse = await page.request.post("/api/clients", {
    data: {
      name: clientName,
      phone: `(21) 9${String(unique).slice(-8)}`,
      email: `financeiro-${unique}@example.com`,
    },
  });

  console.log("POST /api/clients:", clientResponse.status());
  expect(clientResponse.ok()).toBeTruthy();

  const clientData = await clientResponse.json();
  const client = clientData.client ?? clientData;

  const procedureResponse = await page.request.post("/api/procedures", {
    data: {
      name: procedureName,
      price: 150,
      durationMinutes: 60,
    },
  });

  console.log("POST /api/procedures:", procedureResponse.status());
  expect(procedureResponse.ok()).toBeTruthy();

  const procedureData = await procedureResponse.json();
  const procedure = procedureData.procedure ?? procedureData;

  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10 + (unique % 6), 0, 0, 0);

  const end = new Date(start);
  end.setHours(end.getHours() + 1);

  const appointmentResponse = await page.request.post(
    "/api/appointments",
    {
      data: {
        clientId: client.id,
        procedureId: procedure.id,
        professionalName: "Profissional E2E",
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        price: 150,
        status: "scheduled",
      },
    }
  );

  console.log(
    "POST /api/appointments:",
    appointmentResponse.status(),
    await appointmentResponse.text()
  );

  expect(appointmentResponse.ok()).toBeTruthy();

  await page.goto("/app/agenda");

  const appointmentDate = new Date();
  appointmentDate.setDate(appointmentDate.getDate() + 1);

  const dateValue =
    `${appointmentDate.getFullYear()}-` +
    `${String(appointmentDate.getMonth() + 1).padStart(2, "0")}-` +
    `${String(appointmentDate.getDate()).padStart(2, "0")}`;

  await page.locator('input[type="date"]').fill(dateValue);

  const appointmentCard = page
    .locator("div")
    .filter({ hasText: clientName })
    .filter({ hasText: "Registrar pagamento" })
    .first();

  await expect(appointmentCard).toBeVisible();

  await appointmentCard
    .getByRole("button", { name: "Registrar pagamento", exact: true })
    .first()
    .click();

  await expect(
    page.getByRole("heading", { name: "Registrar pagamento" })
  ).toBeVisible();

  const amountInput = page.locator('input[type="number"]').last();

  await expect(amountInput).toHaveValue("150.00");

  await page
    .getByRole("button", { name: "Pix", exact: true })
    .click();

  await page
    .getByRole("button", { name: "Confirmar pagamento" })
    .click();

  await expect(
    appointmentCard.getByText("Pagamento registrado")
  ).toBeVisible();

  await page.goto("/app/financeiro");

  await expect(
    page.getByRole("heading", { name: "Financeiro" })
  ).toBeVisible();

  await expect(
    page.getByText(clientName, { exact: true })
  ).toBeVisible();

  await expect(
    page.getByText(procedureName, { exact: true })
  ).toBeVisible();

  await expect(
    page.getByText("R$ 150,00")
  ).toBeVisible();

  await expect(
    page.getByText("Pix", { exact: true })
  ).toBeVisible();
});
