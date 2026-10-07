import { expect, test } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });
}

test("profissionais têm listas de ativos e inativos e exclusão segura sem histórico", async ({
  page,
}) => {
  await signIn(page);
  const unique = Date.now();
  const name = `E2E Ciclo Profissional ${unique}`;
  const created = await page.request.post("/api/professionals", {
    data: { name },
  });
  expect(created.status()).toBe(201);
  const professional = await created.json();

  await page.goto("/app/profissionais");
  const professionalCard = page.locator("article").filter({ hasText: name });
  await expect(professionalCard).toBeVisible();
  await professionalCard.getByRole("button", { name: "Inativar" }).click();
  await expect(professionalCard).toHaveCount(0);
  await page.getByRole("button", { name: /^Inativos/ }).click();

  const inactiveCard = page.locator("article").filter({ hasText: name });
  await expect(inactiveCard).toBeVisible();
  await inactiveCard.getByText("Ver dados e histórico").click();
  await inactiveCard.getByRole("button", { name: "Consultar atendimentos" }).click();
  await expect(
    inactiveCard.getByText("Nenhum atendimento relacionado.")
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  const deleteResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/professionals/${professional.id}`) &&
      response.request().method() === "DELETE"
  );
  await inactiveCard
    .getByRole("button", { name: "Excluir permanentemente" })
    .click();
  expect((await deleteResponsePromise).status()).toBe(200);
  await expect(inactiveCard).toHaveCount(0);
});

test("automações mostram resumo, oportunidades e clientes sem voltar", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/app/automacoes");

  await expect(page.getByRole("heading", { name: "Automações" })).toBeVisible();
  await expect(page.getByText("Clientes para reativar")).toBeVisible();
  await expect(page.getByText("Oportunidades encontradas")).toBeVisible();
  await expect(page.getByText("Última atualização")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Principais oportunidades" })
  ).toBeVisible();

  await page.getByRole("button", { name: "Atualizar" }).click();
  await expect(page.getByRole("button", { name: "Atualizar" })).toBeEnabled();

  await page.getByText("Clientes sem voltar").click();
  await expect(page.getByLabel("Considerar sem retorno após")).toBeVisible();
});

test("profissionais, disponibilidade e conflitos alimentam os appointments", async ({
  page,
}) => {
  await signIn(page);
  const unique = Date.now();

  const clientResponse = await page.request.post("/api/clients", {
    data: {
      name: `E2E Profissional Cliente ${unique}`,
      phone: `+552199${String(unique).slice(-8)}`,
      email: `e2e-profissional-${unique}@example.com`,
      status: "active",
    },
  });
  expect(clientResponse.status()).toBe(201);
  const client = (await clientResponse.json()).client;

  const procedureResponse = await page.request.post("/api/procedures", {
    data: { name: `E2E Profissional Procedimento ${unique}`, durationMinutes: 60 },
  });
  expect(procedureResponse.status()).toBe(201);
  const procedure = (await procedureResponse.json()).procedure;
  const longProcedureResponse = await page.request.post("/api/procedures", {
    data: { name: `E2E Procedimento Longo ${unique}`, durationMinutes: 90 },
  });
  expect(longProcedureResponse.status()).toBe(201);
  const longProcedure = (await longProcedureResponse.json()).procedure;

  const professionals = [];
  for (const suffix of ["A", "B"]) {
    const response = await page.request.post("/api/professionals", {
      data: {
        name: `E2E Profissional ${suffix} ${unique}`,
        phone: `+552198${String(unique).slice(-8)}`,
        procedureIds: [procedure.id],
      },
    });
    expect(response.status()).toBe(201);
    professionals.push(await response.json());
  }
  const [professionalA, professionalB] = professionals;
  for (const professional of [professionalA, professionalB]) {
    const qualificationResponse = await page.request.patch(
      `/api/professionals/${professional.id}`,
      { data: { procedureIds: [procedure.id, longProcedure.id] } }
    );
    expect(qualificationResponse.status()).toBe(200);
  }
  const unqualifiedProfessionalResponse = await page.request.post(
    "/api/professionals",
    { data: { name: `E2E Sem vínculo ${unique}` } }
  );
  expect(unqualifiedProfessionalResponse.status()).toBe(201);
  const unqualifiedProfessional = await unqualifiedProfessionalResponse.json();
  const dateFromNow = (daysFromNow: number) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000));
  const appointmentDate = dateFromNow(7);
  const appointmentWeekday = new Date(
    `${appointmentDate}T12:00:00-03:00`
  ).getUTCDay();
  const blockedDayOffset = Array.from({ length: 7 }, (_, index) => index + 30)
    .find((days) => new Date(`${dateFromNow(days)}T12:00:00-03:00`).getUTCDay() === appointmentWeekday)!;
  const availableDayOffset = Array.from({ length: 7 }, (_, index) => index + 30)
    .find((days) => new Date(`${dateFromNow(days)}T12:00:00-03:00`).getUTCDay() !== appointmentWeekday)!;

  const availabilityResponse = await page.request.put(
    `/api/professionals/${professionalA.id}/availability`,
    {
      data: {
        weekly: [
          { weekday: appointmentWeekday, startsAt: "09:00", endsAt: "12:00" },
          { weekday: appointmentWeekday, startsAt: "14:00", endsAt: "18:00" },
        ],
        exceptions: [
          { date: dateFromNow(blockedDayOffset), kind: "blocked", reason: "Folga" },
          {
            date: dateFromNow(availableDayOffset),
            kind: "available",
            startsAt: "09:00",
            endsAt: "13:00",
            reason: "Plantão",
          },
        ],
      },
    }
  );
  const availabilityResult = await availabilityResponse.json();
  expect(availabilityResponse.status(), JSON.stringify(availabilityResult)).toBe(200);
  const availability = await page.request.get(
    `/api/professionals/${professionalA.id}/availability`
  );
  expect(availability.status()).toBe(200);
  const availabilityData = await availability.json();
  expect(availabilityData.weekly).toHaveLength(2);
  expect(availabilityData.exceptions).toHaveLength(2);
  const secondAvailabilityResponse = await page.request.put(
    `/api/professionals/${professionalB.id}/availability`,
    {
      data: {
        weekly: [
          { weekday: appointmentWeekday, startsAt: "09:00", endsAt: "12:00" },
        ],
        exceptions: [],
      },
    }
  );
  expect(secondAvailabilityResponse.status()).toBe(200);

  const editedProfessional = await page.request.patch(
    `/api/professionals/${professionalB.id}`,
    { data: { name: `E2E Profissional B editado ${unique}`, active: false } }
  );
  const editedProfessionalData = await editedProfessional.json();
  expect(editedProfessional.status()).toBe(200);
  expect(editedProfessionalData.active).toBe(false);
  await page.request.patch(`/api/professionals/${professionalB.id}`, {
    data: { active: true },
  });

  await page.goto("/app/profissionais");
  await expect(
    page.getByRole("heading", { name: "Profissionais", exact: true })
  ).toBeVisible();
  const professionalCard = page
    .getByText(professionalA.name, { exact: true })
    .locator("xpath=ancestor::article");
  await professionalCard
    .getByRole("button", { name: "Horários e exceções" })
    .click();
  const weekdayNames = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  await expect(
    page.getByRole("checkbox", {
      name: `${weekdayNames[appointmentWeekday]} — Trabalha`,
    })
  ).toBeChecked();
  await expect(
    page.getByLabel(`${weekdayNames[appointmentWeekday]} início do intervalo 1`)
  ).toHaveValue("09:00");
  await expect(
    page.getByLabel(`${weekdayNames[appointmentWeekday]} início do intervalo 2`)
  ).toHaveValue("14:00");
  for (const day of weekdayNames.filter((_, index) => index !== appointmentWeekday)) {
    await expect(
      page.getByRole("checkbox", { name: `${day} — Não trabalha` })
    ).toBeVisible();
  }

  const start = new Date(`${appointmentDate}T09:00:00-03:00`);
  const ends = new Date(start.getTime() + 15 * 60 * 1000);
  const appointmentInput = {
    clientId: client.id,
    procedureId: procedure.id,
    startsAt: start.toISOString(),
    endsAt: ends.toISOString(),
    professionalId: professionalA.id,
    status: "scheduled",
  };

  const unqualifiedAppointment = await page.request.post("/api/appointments", {
    data: {
      ...appointmentInput,
      professionalId: unqualifiedProfessional.id,
    },
  });
  expect(unqualifiedAppointment.status()).toBe(409);
  expect((await unqualifiedAppointment.json()).error).toContain("habilitado");

  const firstAppointment = await page.request.post("/api/appointments", {
    data: appointmentInput,
  });
  expect(firstAppointment.status()).toBe(201);
  const appointment = (await firstAppointment.json()).appointment;
  expect(appointment.professional_id).toBe(professionalA.id);
  expect(new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()).toBe(60 * 60 * 1000);
  const historyResponse = await page.request.get(
    `/api/professionals/${professionalA.id}/history`
  );
  expect(historyResponse.status()).toBe(200);
  const professionalHistory = await historyResponse.json();
  expect(professionalHistory.total).toBe(1);
  expect(professionalHistory.appointments[0].id).toBe(appointment.id);
  await page.request.patch(`/api/professionals/${professionalA.id}`, {
    data: { active: false },
  });
  const protectedDeleteResponse = await page.request.delete(
    `/api/professionals/${professionalA.id}`
  );
  expect(protectedDeleteResponse.status()).toBe(409);
  expect((await protectedDeleteResponse.json()).error).toContain(
    "atendimentos relacionados"
  );
  await page.request.patch(`/api/professionals/${professionalA.id}`, {
    data: { active: true },
  });

  const availableSlots = await page.request.get(
    `/api/appointments/availability?professionalId=${professionalA.id}&procedureId=${procedure.id}&date=${appointmentDate}`
  );
  expect(availableSlots.status()).toBe(200);
  const slotStarts = (await availableSlots.json()).slots.map(
    (slot: { startsAt: string }) => new Date(slot.startsAt).toISOString()
  );
  expect(slotStarts).not.toContain(start.toISOString());
  expect(slotStarts).toContain(new Date(start.getTime() + 60 * 60 * 1000).toISOString());
  expect(slotStarts).not.toContain(
    new Date(start.getTime() + 150 * 60 * 1000).toISOString()
  );

  const sameProfessionalConflict = await page.request.post(
    "/api/appointments",
    { data: appointmentInput }
  );
  expect(sameProfessionalConflict.status()).toBe(409);
  const overlappingAppointment = await page.request.post("/api/appointments", {
    data: {
      ...appointmentInput,
      startsAt: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
      endsAt: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
    },
  });
  expect(overlappingAppointment.status()).toBe(409);

  const differentProfessional = await page.request.post("/api/appointments", {
    data: { ...appointmentInput, professionalId: professionalB.id },
  });
  expect(differentProfessional.status()).toBe(201);
  const consecutiveAppointment = await page.request.post("/api/appointments", {
    data: {
      ...appointmentInput,
      startsAt: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      endsAt: new Date(start.getTime() + 120 * 60 * 1000).toISOString(),
    },
  });
  expect(consecutiveAppointment.status()).toBe(201);
  const consecutiveAppointmentData = await consecutiveAppointment.json();
  const rescheduleConflict = await page.request.patch(
    `/api/appointments/${consecutiveAppointmentData.appointment.id}`,
    {
      data: {
        startsAt: new Date(start.getTime() + 30 * 60 * 1000).toISOString(),
        endsAt: new Date(start.getTime() + 90 * 60 * 1000).toISOString(),
      },
    }
  );
  expect(rescheduleConflict.status()).toBe(409);

  const durationChangeDate = dateFromNow(21);
  const durationChangeStart = new Date(`${durationChangeDate}T09:00:00-03:00`);
  const durationChangeAppointmentResponse = await page.request.post(
    "/api/appointments",
    {
      data: {
        ...appointmentInput,
        startsAt: durationChangeStart.toISOString(),
        endsAt: new Date(durationChangeStart.getTime() + 60 * 60 * 1000).toISOString(),
      },
    }
  );
  expect(durationChangeAppointmentResponse.status()).toBe(201);
  const durationChangeAppointment = (
    await durationChangeAppointmentResponse.json()
  ).appointment;
  const changedProcedureResponse = await page.request.patch(
    `/api/appointments/${durationChangeAppointment.id}`,
    {
      data: {
        procedureId: longProcedure.id,
      },
    }
  );
  expect(changedProcedureResponse.status()).toBe(200);
  let changedAppointment = (await changedProcedureResponse.json()).appointment;
  expect(
    new Date(changedAppointment.ends_at).getTime() -
      new Date(changedAppointment.starts_at).getTime()
  ).toBe(90 * 60 * 1000);

  const changedProfessionalResponse = await page.request.patch(
    `/api/appointments/${durationChangeAppointment.id}`,
    { data: { professionalId: professionalB.id } }
  );
  expect(changedProfessionalResponse.status()).toBe(200);
  const changedProfessionalStart = new Date(
    `${durationChangeDate}T10:30:00-03:00`
  );
  const changedAppointmentTimeResponse = await page.request.patch(
    `/api/appointments/${durationChangeAppointment.id}`,
    {
      data: {
        startsAt: changedProfessionalStart.toISOString(),
        endsAt: new Date(changedProfessionalStart.getTime() + 15 * 60 * 1000).toISOString(),
      },
    }
  );
  expect(changedAppointmentTimeResponse.status()).toBe(200);
  changedAppointment = (await changedAppointmentTimeResponse.json()).appointment;
  expect(
    new Date(changedAppointment.ends_at).getTime() -
      new Date(changedAppointment.starts_at).getTime()
  ).toBe(90 * 60 * 1000);
  const outsideWorkingHoursResponse = await page.request.patch(
    `/api/appointments/${durationChangeAppointment.id}`,
    {
      data: {
        startsAt: new Date(`${durationChangeDate}T10:45:00-03:00`).toISOString(),
        endsAt: new Date(`${durationChangeDate}T11:00:00-03:00`).toISOString(),
      },
    }
  );
  expect(outsideWorkingHoursResponse.status()).toBe(409);

  const blockedDate = dateFromNow(blockedDayOffset);
  const blockedAppointment = await page.request.post("/api/appointments", {
    data: {
      ...appointmentInput,
      startsAt: new Date(`${blockedDate}T10:00:00-03:00`).toISOString(),
      endsAt: new Date(`${blockedDate}T11:00:00-03:00`).toISOString(),
    },
  });
  expect(blockedAppointment.status()).toBe(409);

  const exceptionalDate = dateFromNow(availableDayOffset);
  const exceptionalAppointment = await page.request.post("/api/appointments", {
    data: {
      ...appointmentInput,
      startsAt: new Date(`${exceptionalDate}T12:00:00-03:00`).toISOString(),
      endsAt: new Date(`${exceptionalDate}T12:15:00-03:00`).toISOString(),
    },
  });
  expect(exceptionalAppointment.status()).toBe(201);

  const cancelledAppointment = await page.request.patch(
    `/api/appointments/${appointment.id}`,
    { data: { status: "cancelled" } }
  );
  expect(cancelledAppointment.status()).toBe(200);

  const cancelledPayment = await page.request.post("/api/payments", {
    data: {
      clientId: client.id,
      appointmentId: appointment.id,
      procedureId: procedure.id,
      amount: 100,
      status: "paid",
    },
  });
  expect(cancelledPayment.status()).toBe(409);
  expect((await cancelledPayment.json()).error).toBe("APPOINTMENT_CANCELLED");

  const releasedSlot = await page.request.post("/api/appointments", {
    data: appointmentInput,
  });
  expect(releasedSlot.status()).toBe(201);
  const releasedSlotData = await releasedSlot.json();

  await page.goto("/app/agenda");
  await page.getByRole("button", { name: "Novo agendamento" }).click();
  const professionalSelect = page.getByLabel("Profissional", { exact: true });
  await professionalSelect.selectOption(professionalA.id);
  const procedureSelect = page.getByLabel("Procedimento");
  await expect(
    procedureSelect.locator(`option[value="${procedure.id}"]`)
  ).toHaveCount(1);
  await procedureSelect.selectOption(procedure.id);
  const appointmentDateInput = page.getByLabel("Data do atendimento");
  const availableTimeSelect = page.getByLabel("Horário disponível");
  await appointmentDateInput.fill(appointmentDate);
  await expect(
    availableTimeSelect.getByRole("option", { name: "11:00–12:00" })
  ).toBeAttached();
  await procedureSelect.selectOption(longProcedure.id);
  await expect(
    availableTimeSelect.getByRole("option", { name: "14:00–15:30" })
  ).toBeAttached();
  await procedureSelect.selectOption(procedure.id);
  await appointmentDateInput.fill(dateFromNow(blockedDayOffset));
  await expect(availableTimeSelect).toBeDisabled();
  await expect(page.getByText("Não há horários disponíveis nessa data.")).toBeVisible();
  const exceptionalDateInput = dateFromNow(availableDayOffset);
  await appointmentDateInput.fill(exceptionalDateInput);
  await expect(
    availableTimeSelect.getByRole("option", { name: "11:00–12:00" })
  ).toBeAttached();
  const exceptionalStart = new Date(`${exceptionalDateInput}T11:00:00-03:00`);
  const exceptionalAppointmentResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/appointments") &&
      response.request().method() === "POST"
  );
  await page.locator("form").getByRole("combobox").nth(0).selectOption(client.id);
  await availableTimeSelect.selectOption(exceptionalStart.toISOString());
  await page.getByRole("button", { name: "Salvar agendamento" }).click();
  const exceptionalAppointmentResponse =
    await exceptionalAppointmentResponsePromise;
  expect(exceptionalAppointmentResponse.status()).toBe(201);
  const appointmentFromAgenda = (
    await exceptionalAppointmentResponse.json()
  ).appointment;
  expect(
    new Date(appointmentFromAgenda.ends_at).getTime() -
      new Date(appointmentFromAgenda.starts_at).getTime()
  ).toBe(60 * 60 * 1000);

  await page.getByRole("button", { name: "Novo agendamento" }).click();
  await professionalSelect.selectOption(professionalA.id);
  const renewedProcedureSelect = page.getByLabel("Procedimento");
  await renewedProcedureSelect.selectOption(procedure.id);
  await professionalSelect.selectOption(unqualifiedProfessional.id);
  await expect(
    renewedProcedureSelect.locator(`option[value="${procedure.id}"]`)
  ).toHaveCount(0);

  const deactivatedProcedure = await page.request.delete("/api/procedures", {
    data: { id: procedure.id },
  });
  expect(deactivatedProcedure.status()).toBe(200);
  expect((await deactivatedProcedure.json()).procedure.status).toBe("inactive");
  const activeProcedureList = await page.request.get(
    "/api/procedures?status=active&limit=500"
  );
  expect(
    (await activeProcedureList.json()).procedures.some(
      (item: { id: string }) => item.id === procedure.id
    )
  ).toBe(false);
  const historicalAppointment = await page.request.get(
    `/api/appointments/${releasedSlotData.appointment.id}`
  );
  expect(historicalAppointment.status()).toBe(200);
  expect((await historicalAppointment.json()).appointment.procedure_id).toBe(
    procedure.id
  );
  const inactiveProcedureAppointment = await page.request.post(
    "/api/appointments",
    { data: appointmentInput }
  );
  expect(inactiveProcedureAppointment.status()).toBe(404);
});
