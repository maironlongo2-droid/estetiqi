import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("fluxo básico da agenda", async ({ page }) => {
  await page.goto("/login");

  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const unique = Date.now();
  const clientName = `E2E Agenda ${unique}`;
  const clientEmail = `e2e-agenda-${unique}@example.com`;
  const clientPhone = `(21) 9${String(unique).slice(-8)}`;

  let clientId: string | null = null;
  let appointmentId: string | null = null;

  try {
    // Criar cliente temporário pela API autenticada.
    const clientResponse = await page.request.post("/api/clients", {
      data: {
        name: clientName,
        phone: clientPhone,
        email: clientEmail,
        status: "active",
      },
    });

    expect(clientResponse.ok()).toBeTruthy();

    const clientData = await clientResponse.json();
    clientId = clientData.client?.id ?? clientData.id;

    expect(clientId).toBeTruthy();

    await page.goto("/app/agenda");

    await expect(
      page.getByRole("heading", { name: "Agenda" })
    ).toBeVisible();

    // Abrir formulário.
    await page
      .getByRole("button", { name: "Novo agendamento" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Novo agendamento" })
    ).toBeVisible();

    // Selecionar o cliente dentro do formulário de agendamento.
    const appointmentForm = page
      .getByRole("heading", { name: "Novo agendamento" })
      .locator("..");

    const clientSelect = appointmentForm.locator("select").first();

    await expect(
      clientSelect.locator(`option[value="${clientId}"]`)
    ).toBeAttached();

    await clientSelect.selectOption(clientId!);
    // Criar horário futuro no dia atual.
    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 60);

    function toLocalInputValue(date: Date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");

      return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    await page
      .locator('input[type="datetime-local"]')
      .nth(0)
      .fill(toLocalInputValue(start));

    await page
      .locator('input[type="datetime-local"]')
      .nth(1)
      .fill(toLocalInputValue(end));

    await page
      .locator('input[placeholder="Profissional"]')
      .fill("Profissional E2E");

    await page
      .locator('input[placeholder="Preço"]')
      .fill("150");

    // Criar agendamento.
    const appointmentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/appointments") &&
        response.request().method() === "POST"
    );

    await page
      .getByRole("button", { name: "Salvar agendamento" })
      .click();

    const appointmentResponse = await appointmentResponsePromise;

    console.log(
      "POST /api/appointments:",
      appointmentResponse.status()
    );

    expect(appointmentResponse.ok()).toBeTruthy();

    const appointmentData = await appointmentResponse.json();
    appointmentId =
      appointmentData.appointment?.id ?? appointmentData.id;

    expect(appointmentId).toBeTruthy();

    // Confirmar que apareceu na agenda.
    await expect(page.getByText(clientName)).toBeVisible();

    // Confirmar que o status inicial é agendado.
    await expect(page.getByText("Agendado")).toBeVisible();

    // Alterar para confirmado.
    const appointmentCard = page
      .getByText(clientName)
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')]")
      .first();

    await appointmentCard
      .locator("select")
      .selectOption("confirmed");

    await expect(
      appointmentCard.getByText("Confirmado")
    ).toBeVisible();

    // Cancelar.
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(clientName);
      await dialog.accept();
    });

    await appointmentCard
      .getByRole("button", { name: "Cancelar agendamento" })
      .click();

    await expect(
      appointmentCard.getByText("Cancelado")
    ).toBeVisible();

    // Confirmar diretamente na API que o status persistiu.
    const appointmentGet = await page.request.get(
      `/api/appointments/${appointmentId}`
    );

    expect(appointmentGet.ok()).toBeTruthy();

    const appointmentResult = await appointmentGet.json();

    expect(
      appointmentResult.appointment?.status ??
        appointmentResult.status
    ).toBe("cancelled");
  } finally {
    // Limpeza temporariamente desativada para revelar o erro real do fluxo.
  }
});
