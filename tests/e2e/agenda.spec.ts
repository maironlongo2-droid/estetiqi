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
  let professionalId: string | null = null;

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

    const procedureResponse = await page.request.post("/api/procedures", {
      data: { name: `Procedimento E2E ${unique}`, durationMinutes: 60 },
    });
    expect(procedureResponse.status()).toBe(201);
    const procedureId = (await procedureResponse.json()).procedure.id;

    const professionalResponse = await page.request.post("/api/professionals", {
      data: { name: `Profissional E2E ${unique}`, procedureIds: [procedureId] },
    });
    expect(professionalResponse.status()).toBe(201);
    professionalId = (await professionalResponse.json()).id;

    const start = new Date();
    start.setHours(start.getHours() + 1, 0, 0, 0);

    const localDate = (date: Date) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const get = (type: string) => parts.find((part) => part.type === type)?.value;
      return `${get("year")}-${get("month")}-${get("day")}`;
    };
    const weekday = new Date(
      `${localDate(start)}T12:00:00-03:00`
    ).getUTCDay();
    const availabilityResponse = await page.request.put(
      `/api/professionals/${professionalId}/availability`,
      {
        data: {
          weekly: [{ weekday, startsAt: "00:00", endsAt: "23:59" }],
          exceptions: [],
        },
      }
    );
    expect(availabilityResponse.status()).toBe(200);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/app/agenda");

    await expect(
      page.getByRole("heading", { name: "Agenda" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Próximos atendimentos" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Próximos" })).toBeVisible();
    const agendaDimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(agendaDimensions.content).toBeLessThanOrEqual(
      agendaDimensions.viewport
    );

    // Abrir formulário.
    await page
      .getByRole("button", { name: "Novo agendamento" })
      .click();
    await page.getByLabel("Data do atendimento").fill(localDate(start));

    await expect(
      page.getByRole("heading", { name: "Novo agendamento" })
    ).toBeVisible();

    // Selecionar o cliente dentro do formulário de agendamento.
    const appointmentForm = page
      .getByRole("heading", { name: "Novo agendamento" })
      .locator("..");

    const clientSelect = appointmentForm.locator("select").nth(0);
    const professionalSelect = appointmentForm.locator("select").nth(1);
    const procedureSelect = appointmentForm.locator("select").nth(2);
    await expect(appointmentForm.locator('input[placeholder="Profissional"]')).toHaveCount(0);
    await expect(professionalSelect.locator(`option[value="${professionalId}"]`)).toBeAttached();
    await expect(procedureSelect).toBeVisible();

    await expect(
      clientSelect.locator(`option[value="${clientId}"]`)
    ).toBeAttached();

    await clientSelect.selectOption(clientId!);
    await professionalSelect.selectOption(professionalId!);
    await procedureSelect.selectOption(procedureId);

    const availableTimeSlots = appointmentForm.getByRole("radiogroup", {
      name: "Horário disponível",
    });
    await expect(availableTimeSlots.getByRole("radio").first()).toBeVisible();
    await availableTimeSlots.getByRole("radio").first().click();

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
    expect(appointmentData.appointment?.status).toBe("scheduled");
    expect(appointmentData.appointment?.professional_id).toBe(professionalId);

    const futureClientName = `E2E Agenda futuro ${unique}`;
    const futureClientResponse = await page.request.post("/api/clients", {
      data: {
        name: futureClientName,
        phone: `(21) 8${String(unique).slice(-8)}`,
        email: `e2e-agenda-futuro-${unique}@example.com`,
        status: "active",
      },
    });
    expect(futureClientResponse.ok()).toBeTruthy();
    const futureClientData = await futureClientResponse.json();
    const futureClientId = futureClientData.client?.id ?? futureClientData.id;
    const futureStart = new Date(start);
    futureStart.setDate(futureStart.getDate() + 2);
    const futureEnd = new Date(futureStart);
    futureEnd.setMinutes(futureEnd.getMinutes() + 45);
    const futureAppointmentResponse = await page.request.post(
      "/api/appointments",
      {
        data: {
          clientId: futureClientId,
          startsAt: futureStart.toISOString(),
          endsAt: futureEnd.toISOString(),
          price: 125,
          status: "scheduled",
        },
      }
    );
    expect(futureAppointmentResponse.ok()).toBeTruthy();
    const futureDate = localDate(futureStart);
    const futureDayResponse = await page.request.get(
      `/api/appointments?date=${futureDate}`
    );
    expect(futureDayResponse.ok()).toBeTruthy();
    const futureDayData = await futureDayResponse.json();
    expect(
      futureDayData.appointments.some(
        (item: { client_id: string }) => item.client_id === futureClientId
      )
    ).toBeTruthy();

    const createdAppointmentResponse = await page.request.get(
      `/api/appointments/${appointmentId}`
    );
    expect(createdAppointmentResponse.ok()).toBeTruthy();
    const createdAppointmentData = await createdAppointmentResponse.json();
    expect(createdAppointmentData.appointment.status).toBe("scheduled");
    const procedureName =
      createdAppointmentData.appointment.procedure_name ||
      "Procedimento não informado";
    const professionalName =
      createdAppointmentData.appointment.professional_name;

    // Confirmar que apareceu na agenda.
    await expect(page.getByText(clientName)).toBeVisible();

    // Localizar o card específico deste agendamento.
    const appointmentCard = page
      .getByText(clientName)
      .locator("xpath=ancestor::div[contains(@class,'rounded-xl')]")
      .first();
    const appointmentCardDimensions = await appointmentCard.evaluate((card) => ({
      viewport: document.documentElement.clientWidth,
      right: card.getBoundingClientRect().right,
    }));
    expect(appointmentCardDimensions.right).toBeLessThanOrEqual(
      appointmentCardDimensions.viewport
    );
    const cardText = await appointmentCard.innerText();
    expect(cardText.indexOf(procedureName)).toBeGreaterThanOrEqual(0);
    expect(cardText.indexOf(professionalName)).toBeGreaterThanOrEqual(0);
    expect(cardText.indexOf(clientName)).toBeLessThan(
      cardText.indexOf(procedureName)
    );
    expect(cardText.indexOf(procedureName)).toBeLessThan(
      cardText.indexOf(professionalName)
    );
    const displayedStartTime = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(createdAppointmentData.appointment.starts_at));
    expect(cardText.indexOf(professionalName)).toBeLessThan(
      cardText.indexOf(displayedStartTime)
    );
    expect(cardText.indexOf(displayedStartTime)).toBeLessThan(
      cardText.indexOf("60 min")
    );
    expect(cardText.indexOf("60 min")).toBeLessThan(
      cardText.indexOf("150,00")
    );
    expect(cardText.indexOf("150,00")).toBeGreaterThanOrEqual(0);
    expect(cardText.indexOf("150,00")).toBeLessThan(
      cardText.indexOf("Agendado")
    );

    // Confirmar que o status inicial é agendado.
    await expect(
      appointmentCard.getByText("Agendado", { exact: true })
    ).toBeVisible();

    // A ação principal confirma o atendimento.
    await appointmentCard
      .getByRole("button", { name: "Confirmar atendimento" })
      .click();

    await expect(
      appointmentCard.getByText("Confirmado", { exact: true })
    ).toBeVisible();

    // Ações menos frequentes ficam agrupadas no menu.
    await appointmentCard.locator("summary").click();
    await expect(
      page.getByRole("menuitem", { name: "Registrar pagamento recebido" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("menuitem", { name: "Cancelar agendamento" })
    ).toBeVisible();
    await expect(
      appointmentCard.getByRole("button", { name: "Registrar pagamento" })
    ).toBeVisible();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(clientName);
      await dialog.accept();
    });

    await page
      .getByRole("menuitem", { name: "Cancelar agendamento" })
      .click();

    await expect(
      appointmentCard.getByText("Cancelado", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Cancelar agendamento" })
    ).toHaveCount(0);

    await appointmentCard.locator("summary").click();
    await page
      .getByRole("menuitem", { name: "Editar atendimento" })
      .click();
    const editDialog = page.getByRole("dialog", {
      name: "Editar atendimento",
    });
    const completeAppointmentResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/appointments/${appointmentId}`) &&
        response.request().method() === "PATCH"
    );
    await editDialog
      .getByLabel("Status do atendimento")
      .selectOption("completed");
    await editDialog.getByLabel("Valor do atendimento").fill("175");
    await editDialog.getByLabel("Observações").fill("Correção administrativa E2E");
    await editDialog.getByRole("button", { name: "Salvar correções" }).click();
    const completeAppointmentResponse = await completeAppointmentResponsePromise;
    expect(completeAppointmentResponse.status()).toBe(200);
    expect(
      (await completeAppointmentResponse.json()).appointment.status
    ).toBe("completed");
    await expect(editDialog).toHaveCount(0);

    const restrictedAvailabilityResponse = await page.request.put(
      `/api/professionals/${professionalId}/availability`,
      {
        data: {
          weekly: [{ weekday, startsAt: "00:00", endsAt: "00:01" }],
          exceptions: [],
        },
      }
    );
    expect(restrictedAvailabilityResponse.status()).toBe(200);

    await appointmentCard.locator("summary").click();
    await page
      .getByRole("menuitem", { name: "Editar atendimento" })
      .click();
    const completedEditDialog = page.getByRole("dialog", {
      name: "Editar atendimento",
    });
    await completedEditDialog
      .getByLabel("Observações")
      .fill("Correção após o atendimento concluído");
    await completedEditDialog
      .getByRole("button", { name: "Salvar correções" })
      .click();
    await expect(completedEditDialog).toHaveCount(0);
    await expect(
      appointmentCard.getByRole("button", { name: "Registrar pagamento" })
    ).toBeVisible();
    await appointmentCard.locator("summary").click();
    await expect(
      page.getByRole("menuitem", { name: "Registrar pagamento recebido" })
    ).toHaveCount(0);
    await appointmentCard.locator("summary").click();

    // Confirmar diretamente na API que o status persistiu.
    const appointmentGet = await page.request.get(
      `/api/appointments/${appointmentId}`
    );

    expect(appointmentGet.ok()).toBeTruthy();

    const appointmentResult = await appointmentGet.json();

    expect(
      appointmentResult.appointment?.status ??
        appointmentResult.status
    ).toBe("completed");
    expect(Number(appointmentResult.appointment?.price)).toBe(175);
    expect(appointmentResult.appointment?.notes).toBe(
      "Correção após o atendimento concluído"
    );

    await page.getByRole("button", { name: "Próximos" }).click();
    await expect(
      page.getByRole("heading", { name: "Próximos atendimentos" })
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: futureClientName })
    ).toBeVisible();
    const upcomingDaySections = page.locator("section[aria-label]");
    const upcomingDayTexts = await upcomingDaySections.allInnerTexts();
    const currentAppointmentDay = upcomingDayTexts.findIndex((text) =>
      text.includes(clientName)
    );
    const futureAppointmentDay = upcomingDayTexts.findIndex((text) =>
      text.includes(futureClientName)
    );
    expect(currentAppointmentDay).toBeGreaterThanOrEqual(0);
    expect(futureAppointmentDay).toBeGreaterThan(currentAppointmentDay);
    const futureCardText = await upcomingDaySections
      .nth(futureAppointmentDay)
      .innerText();
    expect(futureCardText).toContain("45 min");
    expect(futureCardText).toContain("125,00");
    expect(futureCardText).not.toContain("Horário ");
  } finally {
    // Limpeza temporariamente desativada para revelar o erro real do fluxo.
  }
});
