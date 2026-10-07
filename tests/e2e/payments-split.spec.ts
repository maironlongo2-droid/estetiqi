import { expect, test } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("registra pagamento dividido pela Agenda inclusive com centavos", async ({
  page,
}) => {
  await page.goto("/login");
  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const unique = Date.now();
  const clientResponse = await page.request.post("/api/clients", {
    data: {
      name: `Cliente Pagamento UI ${unique}`,
      phone: `(21) 9${String(unique).slice(-8)}`,
      email: `pagamento-ui-${unique}@example.com`,
    },
  });
  expect(clientResponse.ok()).toBeTruthy();
  const clientData = await clientResponse.json();
  const client = clientData.client ?? clientData;

  const procedureResponse = await page.request.post("/api/procedures", {
    data: { name: `Procedimento Pagamento UI ${unique}`, price: 200.5, durationMinutes: 60 },
  });
  expect(procedureResponse.ok()).toBeTruthy();
  const procedureData = await procedureResponse.json();
  const procedure = procedureData.procedure ?? procedureData;

  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 1);
  startsAt.setHours(15, 0, 0, 0);
  const endsAt = new Date(startsAt);
  endsAt.setHours(16, 0, 0, 0);

  const appointmentResponse = await page.request.post("/api/appointments", {
    data: {
      clientId: client.id,
      procedureId: procedure.id,
      professionalName: `Profissional Pagamento UI ${unique}`,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      price: 200.5,
      status: "completed",
    },
  });
  expect(appointmentResponse.ok()).toBeTruthy();
  const appointmentData = await appointmentResponse.json();
  const appointment = appointmentData.appointment ?? appointmentData;

  const dateInSaoPaulo = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(startsAt);

  await page.goto("/app/agenda");
  await page.locator('input[type="date"]').fill(dateInSaoPaulo);

  const clientLink = page.getByRole("link", {
    name: `Cliente Pagamento UI ${unique}`,
  });
  await expect(clientLink).toBeVisible();

  const appointmentCard = clientLink
    .locator("xpath=ancestor::div[contains(@class,'rounded-xl')]")
    .first();
  await appointmentCard
    .getByRole("button", { name: "Registrar pagamento" })
    .click();

  const paymentForm = page
    .getByRole("heading", { name: "Registrar pagamento" })
    .locator("xpath=ancestor::form");
  await expect(paymentForm).toBeVisible();

  const amounts = paymentForm.locator('input[type="number"]');
  await amounts.nth(0).fill("80.50");
  await paymentForm.locator("select").nth(0).selectOption("pix");
  await paymentForm.getByText("+ Adicionar forma de pagamento").click();
  await amounts.nth(1).fill("120");
  await paymentForm.locator("select").nth(1).selectOption("credito");

  const paymentResponsesPromise = Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/payments") &&
        response.request().method() === "POST" &&
        JSON.parse(response.request().postData() || "{}").amount === 80.5
    ),
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/payments") &&
        response.request().method() === "POST" &&
        JSON.parse(response.request().postData() || "{}").amount === 120
    ),
  ]);
  await paymentForm
    .getByRole("button", { name: "Confirmar pagamento" })
    .click();

  const paymentResponses = await paymentResponsesPromise;
  await expect(paymentForm).toHaveCount(0);
  for (const response of paymentResponses) {
    expect(
      response.ok(),
      `POST /api/payments falhou: ${response.status()} ${await response.text()}`
    ).toBeTruthy();
  }

  const paymentsResponse = await page.request.get("/api/payments");
  expect(paymentsResponse.ok()).toBeTruthy();
  const payments = await paymentsResponse.json();
  const appointmentPayments = payments.filter(
    (payment: { appointment_id: string }) =>
      payment.appointment_id === appointment.id
  );
  expect(appointmentPayments).toHaveLength(2);
  expect(
    appointmentPayments.reduce(
      (total: number, payment: { amount: string | number }) =>
        total + Number(payment.amount),
      0
    )
  ).toBe(200.5);
  await expect(
    appointmentCard.getByLabel("Status do pagamento: Pago")
  ).toBeVisible();
});
