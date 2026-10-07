import { expect, test } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("perfil e oportunidade de retorno usam o histórico do cliente", async ({
  page,
}) => {
  await page.goto("/login");
  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const unique = Date.now();
  const clientName = `E2E Retorno ${unique}`;
  const procedureName = `E2E Procedimento Retorno ${unique}`;

  const clientResponse = await page.request.post("/api/clients", {
    data: {
      name: clientName,
      phone: `+552199${String(unique).slice(-8)}`,
      email: `e2e-retorno-${unique}@example.com`,
      status: "active",
    },
  });
  expect(clientResponse.status()).toBe(201);
  const client = (await clientResponse.json()).client;

  const procedureResponse = await page.request.post("/api/procedures", {
    data: {
      name: procedureName,
      returnIntervalDays: 30,
      status: "active",
    },
  });
  expect(procedureResponse.status()).toBe(201);
  const procedure = (await procedureResponse.json()).procedure;

  for (const daysAgo of [11000, 10000]) {
    const start = new Date(
      Date.now() - daysAgo * 24 * 60 * 60 * 1000 - 60 * 60 * 1000
    );
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + 45);

    const appointmentResponse = await page.request.post("/api/appointments", {
      data: {
        clientId: client.id,
        procedureId: procedure.id,
        professionalName: `E2E Retorno ${unique}`,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        price: 150,
        status: "completed",
      },
    });
    expect(appointmentResponse.status()).toBe(201);
  }

  const profileResponse = await page.request.get(
    `/api/clients/${client.id}/profile`
  );
  expect(profileResponse.status()).toBe(200);
  const profile = await profileResponse.json();
  expect(profile.totals.completed_count).toBe(2);
  expect(profile.totals.most_frequent_procedure).toBe(procedureName);
  expect(profile.totals.last_procedure).toBe(procedureName);
  expect(profile.totals.return_interval_days).toBe(30);

  const suggestionsResponse = await page.request.get(
    "/api/ai/opportunities?type=client_return"
  );
  expect(suggestionsResponse.status()).toBe(200);
  const suggestions = await suggestionsResponse.json();
  const suggestedClient = suggestions.clients.find(
    (candidate: { id: string }) => candidate.id === client.id
  );
  expect(suggestedClient).toMatchObject({
    expected_return_days: 30,
    priority: "high",
    opportunity_id: null,
  });

  const firstGeneration = await page.request.post("/api/ai/opportunities", {
    data: { type: "client_return" },
  });
  expect(firstGeneration.status()).toBe(200);
  const firstResult = await firstGeneration.json();
  const firstClient = firstResult.clients.find(
    (candidate: { id: string }) => candidate.id === client.id
  );
  expect(firstClient).toMatchObject({
    expected_return_days: 30,
    priority: "high",
    opportunity_status: "open",
  });
  expect(firstClient.inactive_days).toBeGreaterThanOrEqual(10000);
  expect(firstClient.reason).toContain(`${firstClient.inactive_days} dias`);
  expect(firstClient.opportunity_id).toBeTruthy();

  const secondGeneration = await page.request.post("/api/ai/opportunities", {
    data: { type: "client_return" },
  });
  expect(secondGeneration.status()).toBe(200);
  const secondResult = await secondGeneration.json();
  const secondClient = secondResult.clients.find(
    (candidate: { id: string }) => candidate.id === client.id
  );
  expect(secondClient.opportunity_id).toBe(firstClient.opportunity_id);

  await page.route("**/api/ai/opportunities**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const postData = request.postData();
    const isReturnGenerationRequest =
      request.method() === "POST" &&
      Boolean(postData && JSON.parse(postData).type === "client_return");
    const isReturnCandidatesRequest =
      url.pathname === "/api/ai/opportunities" &&
      (url.searchParams.get("type") === "client_return" ||
        isReturnGenerationRequest);

    if (!isReturnCandidatesRequest) {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const data = (await response.json()) as {
      clients?: Array<{ id: string }>;
      opportunities?: Array<{ client_id?: string | null }>;
    };
    await route.fulfill({
      response,
      json: {
        ...data,
        clients: data.clients?.filter((candidate) => candidate.id === client.id),
        opportunities: data.opportunities?.filter(
          (opportunity) => opportunity.client_id === client.id
        ),
      },
    });
  });

  await page.goto("/app");
  await page
    .getByRole("button", { name: "Gerar oportunidades de retorno" })
    .click();

  const clientLink = page.getByRole("link", { name: clientName });
  await expect(clientLink).toBeVisible();
  const opportunityCard = clientLink.locator(
    "xpath=ancestor::div[contains(@class,'rounded-xl')]"
  );
  await expect(opportunityCard.getByText(firstClient.reason)).toBeVisible();
  const generateMessageButton = opportunityCard.getByRole("button", {
    name: "Gerar mensagem",
  });
  await expect(generateMessageButton).toBeVisible();
  const messageResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/ai/opportunities/${firstClient.opportunity_id}/message`) &&
      response.request().method() === "POST"
  );
  await generateMessageButton.click();
  const messageResponse = await messageResponsePromise;
  expect([200, 502, 503]).toContain(messageResponse.status());

  let message: string;
  if (messageResponse.ok()) {
    message = (await messageResponse.json()).message;
    expect(message.length).toBeGreaterThan(0);
  } else {
    const error = await messageResponse.json();
    expect(error.error).toBeTruthy();
    await expect(
      opportunityCard.getByText(
        messageResponse.status() === 503
          ? "A geração de mensagens não está configurada neste ambiente. Peça ao responsável pelo EstetiQI para habilitar o serviço."
          : "Não foi possível gerar a mensagem agora. Tente novamente."
      )
    ).toBeVisible();
    await expect(generateMessageButton).toBeEnabled();

    message = "Oi, E2E! Vamos conversar sobre seu retorno?";
    await page.route(
      `**/api/ai/opportunities/${firstClient.opportunity_id}/message`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ message }),
        })
    );
    const retryResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/ai/opportunities/${firstClient.opportunity_id}/message`) &&
        response.request().method() === "POST"
    );
    await opportunityCard
      .getByRole("button", { name: "Gerar mensagem" })
      .click();
    expect((await retryResponsePromise).status()).toBe(200);
  }

  const messageEditor = opportunityCard.getByLabel("Revise ou edite a mensagem");
  await expect(messageEditor).toHaveValue(message);
  const editedMessage = "Oi, E2E! Vamos conversar sobre seu retorno?";
  await messageEditor.fill(editedMessage);
  const whatsappLink = opportunityCard.getByRole("link", {
    name: "Abrir WhatsApp",
  });
  await expect(whatsappLink).toHaveAttribute(
    "href",
    new RegExp(`wa\\.me/552199${String(unique).slice(-8)}\\?text=`)
  );
  const whatsappHref = await whatsappLink.evaluate(
    (link: HTMLAnchorElement) => link.href
  );
  expect(new URL(whatsappHref).searchParams.get("text")).toBe(editedMessage);

  await page.context().route("https://wa.me/**", (route) => route.abort());
  const actionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/ai/actions") &&
      response.request().method() === "POST"
  );
  const popupPromise = page.waitForEvent("popup");
  await whatsappLink.click();
  const [popup, actionResponse] = await Promise.all([
    popupPromise,
    actionResponsePromise,
  ]);
  await popup.close();
  await page.context().unroute("https://wa.me/**");
  expect(actionResponse.status()).toBe(201);
  const loggedAction = await actionResponse.json();
  expect(loggedAction).toMatchObject({
    type: "whatsapp_opened",
    status: "whatsapp_opened",
    client_id: client.id,
    opportunity_id: firstClient.opportunity_id,
    payload: { action: "wa.me_opened", message: editedMessage },
    result: { messageSent: false },
  });
  expect(loggedAction.created_by_user_id).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/inteligencia");
  const intelligenceCard = page
    .getByRole("button", { name: new RegExp(clientName) });
  await expect(intelligenceCard).toBeVisible();
  await expect(intelligenceCard).toContainText(firstClient.reason);
  await expect(intelligenceCard).not.toContainText("O que recomendamos");
  await intelligenceCard.click();
  const opportunityDialog = page.getByRole("dialog");
  await expect(
    opportunityDialog.getByRole("heading", { name: clientName })
  ).toBeVisible();
  await expect(
    opportunityDialog.getByText(firstClient.reason)
  ).toBeVisible();
  await expect(opportunityDialog.getByText("Histórico do cliente")).toBeVisible();
  await expect(opportunityDialog.getByText(procedureName)).toBeVisible();
  await expect(opportunityDialog.getByText("Intervalo esperado de retorno")).toBeVisible();
  await expect(
    opportunityDialog.getByLabel("Revise ou edite a mensagem")
  ).toBeVisible();
  const dialogBounds = await opportunityDialog.boundingBox();
  if (!dialogBounds) throw new Error("O detalhe da oportunidade não está visível.");
  expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(390);
  expect(dialogBounds.y + dialogBounds.height).toBeLessThanOrEqual(844);
  const suggestedMessage = "Oi, vamos conversar sobre seu retorno?";
  await page.route(
    `**/api/ai/opportunities/${firstClient.opportunity_id}/message`,
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "A geração de mensagens não está configurada neste ambiente. Peça ao responsável pelo EstetiQI para habilitar o serviço.",
        }),
      })
  );
  await opportunityDialog
    .getByRole("button", { name: "Gerar mensagem sugerida" })
    .click();
  await expect(
    opportunityDialog.getByRole("alert")
  ).toContainText("não está configurada neste ambiente");
  await expect(
    opportunityDialog.getByRole("button", { name: "Gerar mensagem sugerida" })
  ).toBeEnabled();
  await page.unroute(
    `**/api/ai/opportunities/${firstClient.opportunity_id}/message`
  );

  await page.route(
    `**/api/ai/opportunities/${firstClient.opportunity_id}/message`,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: suggestedMessage }),
      })
  );
  await opportunityDialog
    .getByRole("button", { name: "Gerar mensagem sugerida" })
    .click();
  const intelligenceMessageEditor = opportunityDialog.getByLabel(
    "Revise ou edite a mensagem"
  );
  await expect(intelligenceMessageEditor).toHaveValue(suggestedMessage);
  const intelligenceEditedMessage = "Oi! Podemos conversar sobre seu retorno?";
  await intelligenceMessageEditor.fill(intelligenceEditedMessage);
  const intelligenceWhatsAppLink = opportunityDialog.getByRole("link", {
    name: "Abrir WhatsApp",
  });
  await expect(intelligenceWhatsAppLink).toHaveAttribute(
    "href",
    new RegExp(`wa\\.me/552199${String(unique).slice(-8)}\\?text=`)
  );
  expect(
    new URL(
      await intelligenceWhatsAppLink.evaluate(
        (link: HTMLAnchorElement) => link.href
      )
    ).searchParams.get("text")
  ).toBe(intelligenceEditedMessage);
  await page.context().route("https://wa.me/**", (route) => route.abort());
  const intelligenceActionResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/ai/actions") &&
      response.request().method() === "POST"
  );
  const intelligencePopupPromise = page.waitForEvent("popup");
  await intelligenceWhatsAppLink.click();
  const [intelligencePopup, intelligenceActionResponse] = await Promise.all([
    intelligencePopupPromise,
    intelligenceActionResponsePromise,
  ]);
  await intelligencePopup.close();
  await page.context().unroute("https://wa.me/**");
  expect(intelligenceActionResponse.status()).toBe(201);
  expect(await intelligenceActionResponse.json()).toMatchObject({
    type: "whatsapp_opened",
    client_id: client.id,
    opportunity_id: firstClient.opportunity_id,
    payload: { message: intelligenceEditedMessage },
    result: { messageSent: false },
  });
  await page.unroute(
    `**/api/ai/opportunities/${firstClient.opportunity_id}/message`
  );
  await opportunityDialog
    .getByRole("button", { name: "Criar ação para revisar" })
    .click();
  await expect(
    opportunityDialog.getByText("Aguardando sua aprovação")
  ).toBeVisible();

  const approveResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/ai/actions/") &&
      response.request().method() === "PATCH"
  );
  await opportunityDialog.getByRole("button", { name: "Aprovar" }).click();
  const approveResponse = await approveResponsePromise;
  expect(approveResponse.status()).toBe(200);
  expect((await approveResponse.json()).status).toBe("approved");
  await expect(
    opportunityDialog.getByText("Aprovada — pronta para executar")
  ).toBeVisible();
  await expect(
    opportunityDialog.getByRole("button", { name: "Executar ação" })
  ).toBeVisible();

  const discardedActionResponse = await page.request.post("/api/ai/actions", {
    data: {
      opportunityId: firstClient.opportunity_id,
      clientId: client.id,
      type: "recommended_action",
      payload: { suggestedAction: "Descartar no teste." },
    },
  });
  expect(discardedActionResponse.status()).toBe(201);
  const discardedAction = await discardedActionResponse.json();
  await page.reload();
  const pendingIntelligenceCard = page.getByRole("button", {
    name: new RegExp(clientName),
  });
  await pendingIntelligenceCard.click();
  const pendingOpportunityDialog = page.getByRole("dialog");
  await expect(
    pendingOpportunityDialog.getByRole("button", { name: "Recusar ação" })
  ).toBeVisible();
  const discardResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/ai/actions/${discardedAction.id}`) &&
      response.request().method() === "PATCH"
  );
  await pendingOpportunityDialog.getByRole("button", { name: "Recusar ação" }).click();
  const discardResponse = await discardResponsePromise;
  expect(discardResponse.status()).toBe(200);
  expect((await discardResponse.json()).status).toBe("cancelled");
  await expect(pendingIntelligenceCard).toHaveCount(0);
  const actionHistoryResponse = await page.request.get("/api/ai/actions");
  expect(actionHistoryResponse.ok()).toBeTruthy();
  const actionHistory = await actionHistoryResponse.json();
  expect(actionHistory).toContainEqual(
    expect.objectContaining({
      id: discardedAction.id,
      status: "cancelled",
    })
  );
  await expect(
    page.getByText(/Ações recusadas \(\d+\) — mantidas no histórico/)
  ).toBeVisible();

  const hiddenSuggestionResponse = await page.request.get(
    "/api/ai/opportunities?type=client_return"
  );
  expect(hiddenSuggestionResponse.ok()).toBeTruthy();
  const hiddenSuggestions = await hiddenSuggestionResponse.json();
  expect(
    hiddenSuggestions.clients.some(
      (candidate: { id: string }) => candidate.id === client.id
    )
  ).toBeFalsy();

  const hiddenQueueResponse = await page.request.get("/api/ai/opportunities");
  expect(hiddenQueueResponse.ok()).toBeTruthy();
  const hiddenQueue = await hiddenQueueResponse.json();
  expect(
    hiddenQueue.some(
      (candidate: { id: string }) => candidate.id === firstClient.opportunity_id
    )
  ).toBeFalsy();
});
