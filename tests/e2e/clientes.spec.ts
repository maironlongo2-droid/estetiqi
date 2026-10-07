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
  let permanentlyDeleted = false;
  let clientId: string | null = null;
  let clientNameInUse = clientName;

  try {
    const authContextResponse = await page.request.get("/api/auth/context");
    expect(authContextResponse.ok()).toBeTruthy();
    const authContext = await authContextResponse.json();

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
    const createdClientData = await createResponse.json();
    clientId = createdClientData.client.id;
    expect(createdClientData.client.organization_id).toBe(
      authContext.organization.id
    );
    const tenantScopeResponse = await page.request.patch(
      `/api/clients/${clientId}`,
      {
        data: {
          name: clientName,
          organizationId: "00000000-0000-0000-0000-000000000000",
          organization_id: "00000000-0000-0000-0000-000000000000",
        },
      }
    );
    expect(tenantScopeResponse.ok()).toBeTruthy();
    const tenantScopedClient = await tenantScopeResponse.json();
    expect(tenantScopedClient.client.organization_id).toBe(
      authContext.organization.id
    );

    // Recarregar para validar que o cliente persistido aparece na listagem.
    await page.reload();

    await expect(
      page.getByText(clientName, { exact: true })
    ).toBeVisible();

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
    const whatsappLink = page.getByRole("link", {
      name: "Enviar pelo WhatsApp",
    });
    await expect(whatsappLink).toHaveAttribute(
      "href",
      new RegExp(`wa\\.me/55219${String(unique).slice(-8)}\\?text=`)
    );
    await expect(whatsappLink).toHaveAttribute("target", "_blank");
    const whatsappHref = await whatsappLink.evaluate(
      (link: HTMLAnchorElement) => link.href
    );
    expect(new URL(whatsappHref).searchParams.get("text")).toContain("Oi, E2E!");

    await page.goto("/app/clientes");
    await expect(page.getByText(clientName)).toBeVisible();

    let clientRow = page
      .getByText(clientNameInUse, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'justify-between')]");

    await clientRow.locator(`summary[aria-label="Ações de ${clientName}"]`).click();
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByLabel("Nome *").fill(`${clientName} Editado`);
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    clientNameInUse = `${clientName} Editado`;
    await expect(page.getByText(clientNameInUse, { exact: true })).toBeVisible();

    clientRow = page
      .getByText(clientNameInUse, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'justify-between')]");

    await clientRow
      .locator(`summary[aria-label="Ações de ${clientNameInUse}"]`)
      .click();
    await expect(page.getByRole("button", { name: "Inativar" })).toBeVisible();
    const deactivateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/clients/`) &&
        response.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "Inativar" }).click();
    const deactivateResponse = await deactivateResponsePromise;
    expect(deactivateResponse.ok()).toBeTruthy();

    await expect(page.getByText(clientNameInUse, { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Inativos", exact: true }).click();
    await expect(page.getByText(clientNameInUse, { exact: true })).toBeVisible();
    clientRow = page
      .getByText(clientNameInUse, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'justify-between')]");
    await expect(
      clientRow.locator(`summary[aria-label="Ações de ${clientNameInUse}"]`)
    ).toBeVisible();
    await clientRow
      .locator(`summary[aria-label="Ações de ${clientNameInUse}"]`)
      .click();
    await expect(page.getByRole("button", { name: "Reativar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Inativar" })).toHaveCount(0);
    await page
      .locator(`summary[aria-label="Ações de ${clientNameInUse}"]`)
      .click();

    const clientsResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/api/clients?status=active") &&
        response.request().method() === "GET"
    );
    await page.goto("/app/agenda");
    const activeClientsResponse = await clientsResponsePromise;
    expect(activeClientsResponse.ok()).toBeTruthy();
    const activeClients = await activeClientsResponse.json();
    expect(
      activeClients.clients.some(
        (client: { id: string }) => client.id === clientId
      )
    ).toBeFalsy();

    const inactiveAppointmentResponse = await page.request.post(
      "/api/appointments",
      {
        data: {
          clientId,
          startsAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000).toISOString(),
          endsAt: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
          status: "scheduled",
        },
      }
    );
    expect(inactiveAppointmentResponse.status()).toBe(404);
    const inactiveQuickClientResponse = await page.request.post(
      "/api/clients/quick",
      { data: { name: clientNameInUse } }
    );
    expect(inactiveQuickClientResponse.status()).toBe(409);

    await page.getByRole("button", { name: "Novo agendamento" }).click();
    const agendaClientSelect = page
      .getByRole("heading", { name: "Novo agendamento" })
      .locator("..")
      .locator("select")
      .first();
    await expect(
      agendaClientSelect.locator(`option[value="${clientId}"]`)
    ).toHaveCount(0);

    await page.goto("/app/clientes");
    await page.getByRole("button", { name: "Inativos", exact: true }).click();
    clientRow = page
      .getByText(clientNameInUse, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'justify-between')]");
    await clientRow
      .locator(`summary[aria-label="Ações de ${clientNameInUse}"]`)
      .click();
    const reactivateResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/clients/`) &&
        response.request().method() === "PATCH"
    );
    await page.getByRole("button", { name: "Reativar" }).click();
    expect((await reactivateResponsePromise).ok()).toBeTruthy();
    await page.getByRole("button", { name: "Ativos", exact: true }).click();
    await expect(page.getByText(clientNameInUse, { exact: true })).toBeVisible();

    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + 90);
    startsAt.setHours(10, 0, 0, 0);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const appointmentResponse = await page.request.post("/api/appointments", {
      data: {
        clientId,
        professionalName: `Profissional CRM ${unique}`,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        price: 180,
        notes: `Nota pessoal ${clientNameInUse}`,
        status: "scheduled",
      },
    });
    expect(appointmentResponse.ok()).toBeTruthy();
    const appointment = (await appointmentResponse.json()).appointment;

    const paymentResponse = await page.request.post("/api/payments", {
      data: {
        clientId,
        appointmentId: appointment.id,
        amount: 180,
        paymentMethod: "pix",
        status: "paid",
        notes: `Nota financeira ${clientNameInUse}`,
      },
    });
    expect(paymentResponse.status()).toBe(201);
    const payment = await paymentResponse.json();

    clientRow = page
      .getByText(clientNameInUse, { exact: true })
      .locator("xpath=ancestor::div[contains(@class,'justify-between')]");
    await clientRow
      .locator(`summary[aria-label="Ações de ${clientNameInUse}"]`)
      .click();
    const missingConfirmationResponse = await page.request.delete(
      `/api/clients/${clientId}`
    );
    expect(missingConfirmationResponse.status()).toBe(400);
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Excluir cliente permanentemente?");
      expect(dialog.message()).toContain("não pode ser desfeita");
      expect(dialog.message()).toContain("dados pessoais");
      await dialog.accept();
    });
    const permanentDeleteResponsePromise = page.waitForResponse(
      (response) =>
        response.url() === `http://localhost:3000/api/clients/${clientId}` &&
        response.request().method() === "DELETE"
    );
    await page.getByRole("button", { name: "Excluir permanentemente" }).click();
    const permanentDeleteResponse = await permanentDeleteResponsePromise;
    expect(permanentDeleteResponse.status()).toBe(200);
    permanentlyDeleted = true;

    expect(
      (await page.request.get(`/api/clients/${clientId}`)).status()
    ).toBe(404);
    expect(
      (await page.request.get(`/api/clients/${clientId}/profile`)).status()
    ).toBe(404);
    expect(
      (
        await page.request.patch(`/api/clients/${clientId}`, {
          data: { status: "active" },
        })
      ).status()
    ).toBe(404);

    for (const status of ["active", "inactive", "all"]) {
      const clientsResponse = await page.request.get(
        `/api/clients?status=${status}&search=${encodeURIComponent(clientName)}`
      );
      expect(clientsResponse.ok()).toBeTruthy();
      const clientsData = await clientsResponse.json();
      expect(
        clientsData.clients.some(
          (client: { id: string }) => client.id === clientId
        )
      ).toBeFalsy();
    }

    const appointmentAfterDeletion = await page.request.get(
      `/api/appointments/${appointment.id}`
    );
    expect(appointmentAfterDeletion.ok()).toBeTruthy();
    const historicalAppointment = (
      await appointmentAfterDeletion.json()
    ).appointment;
    expect(historicalAppointment.client_name).toBe("Cliente removido");
    expect(historicalAppointment.notes).toBeNull();
    expect(JSON.stringify(historicalAppointment)).not.toContain(clientEmail);
    expect(JSON.stringify(historicalAppointment)).not.toContain(clientPhone);

    const paymentsAfterDeletion = await page.request.get("/api/payments");
    expect(paymentsAfterDeletion.ok()).toBeTruthy();
    const historicalPayment = (await paymentsAfterDeletion.json()).find(
      (record: { id: string }) => record.id === payment.id
    );
    expect(historicalPayment).toMatchObject({
      client_id: clientId,
      client_name: "Cliente removido",
      amount: "180.00",
      payment_method: "pix",
      status: "paid",
      notes: null,
    });
    expect(JSON.stringify(historicalPayment)).not.toContain(clientEmail);
    expect(JSON.stringify(historicalPayment)).not.toContain(clientPhone);
  } finally {
    if (clientCreated && clientId && !permanentlyDeleted) {
      await page.request.delete(`/api/clients/${clientId}`, {
        data: { confirmation: "DELETE_PERMANENTLY" },
      });
    }
  }
});
