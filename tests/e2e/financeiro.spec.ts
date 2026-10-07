import { test, expect } from "@playwright/test";
import { clerk } from "@clerk/testing/playwright";

test("pagamento único via API", async ({ page }) => {
  await page.goto("/login");

  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const unique = Date.now();
  const clientName = `Cliente Financeiro E2E ${unique}`;
  const procedureName = `Procedimento Financeiro E2E ${unique}`;
  const professionalName = `Profissional Financeiro E2E ${unique}`;

  // Create client
  const clientResponse = await page.request.post("/api/clients", {
    data: {
      name: clientName,
      phone: `(21) 9${String(unique).slice(-8)}`,
      email: `financeiro-${unique}@example.com`,
    },
  });

  expect(clientResponse.ok()).toBeTruthy();
  const clientData = await clientResponse.json();
  const client = clientData.client ?? clientData;

  // Create procedure
  const procedureResponse = await page.request.post("/api/procedures", {
    data: {
      name: procedureName,
      price: 150,
      durationMinutes: 60,
    },
  });

  expect(procedureResponse.ok()).toBeTruthy();
  const procedureData = await procedureResponse.json();
  const procedure = procedureData.procedure ?? procedureData;

  // Create appointment
  const start = new Date();
  start.setDate(start.getDate() + 30);
  start.setHours(10, 0, 0, 0);

  const end = new Date(start);
  end.setHours(11, 0, 0, 0);

  const appointmentResponse = await page.request.post(
    "/api/appointments",
    {
      data: {
        clientId: client.id,
        procedureId: procedure.id,
        professionalName,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        price: 150,
        status: "completed",
      },
    }
  );

  expect(appointmentResponse.ok()).toBeTruthy();
  const appointmentData = await appointmentResponse.json();
  const appointmentId = appointmentData.appointment.id;

  // Register a single payment
  const paymentResponse = await page.request.post("/api/payments", {
    data: {
      clientId: client.id,
      appointmentId: appointmentId,
      procedureId: procedure.id,
      amount: 150,
      paymentMethod: "pix",
      status: "paid",
    },
  });

  expect(paymentResponse.ok()).toBeTruthy();
  const payment = await paymentResponse.json();
  expect(payment).toMatchObject({
    client_id: client.id,
    appointment_id: appointmentId,
    procedure_id: procedure.id,
    status: "paid",
    payment_method: "pix",
  });

  // Verify payment was saved
  const paymentGetResponse = await page.request.get("/api/payments");
  expect(paymentGetResponse.ok()).toBeTruthy();
  const payments = await paymentGetResponse.json();
  const foundPayment = payments.find(
    (record: { id: string }) => record.id === payment.id
  );
  expect(foundPayment).toBeTruthy();
});

test("pagamento dividido (múltiplos métodos) via API", async ({ page }) => {
  await page.goto("/login");

  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const unique = Date.now();
  const clientName = `Cliente Split E2E ${unique}`;
  const procedureName = `Procedimento Split E2E ${unique}`;
  const professionalName = `Profissional Split E2E ${unique}`;

  // Create client
  const clientResponse = await page.request.post("/api/clients", {
    data: {
      name: clientName,
      phone: `(21) 9${String(unique).slice(-8)}`,
      email: `split-${unique}@example.com`,
    },
  });

  expect(clientResponse.ok()).toBeTruthy();
  const client = (await clientResponse.json()).client;

  // Create procedure
  const procedureResponse = await page.request.post("/api/procedures", {
    data: {
      name: procedureName,
      price: 200,
      durationMinutes: 60,
    },
  });

  expect(procedureResponse.ok()).toBeTruthy();
  const procedure = (await procedureResponse.json()).procedure;

  // Create appointment
  const start = new Date();
  start.setDate(start.getDate() + 31);
  start.setHours(14, 0, 0, 0);

  const end = new Date(start);
  end.setHours(15, 0, 0, 0);

  const appointmentResponse = await page.request.post(
    "/api/appointments",
    {
      data: {
        clientId: client.id,
        procedureId: procedure.id,
        professionalName,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        price: 200,
        status: "completed",
      },
    }
  );

  expect(appointmentResponse.ok()).toBeTruthy();
  const appointmentId = (await appointmentResponse.json()).appointment.id;

  // Register split payment - Pix
  const paymentPixResponse = await page.request.post("/api/payments", {
    data: {
      clientId: client.id,
      appointmentId: appointmentId,
      procedureId: procedure.id,
      amount: 80,
      paymentMethod: "pix",
      status: "paid",
    },
  });

  expect(paymentPixResponse.ok()).toBeTruthy();
  const paymentPix = await paymentPixResponse.json();
  expect(paymentPix.payment_method).toBe("pix");
  expect(parseFloat(paymentPix.amount)).toBe(80);

  // Register split payment - Card (Crédito)
  const paymentCardResponse = await page.request.post("/api/payments", {
    data: {
      clientId: client.id,
      appointmentId: appointmentId,
      procedureId: procedure.id,
      amount: 120,
      paymentMethod: "credito",
      status: "paid",
    },
  });

  expect(paymentCardResponse.ok()).toBeTruthy();
  const paymentCard = await paymentCardResponse.json();
  expect(paymentCard.payment_method).toBe("credito");
  expect(parseFloat(paymentCard.amount)).toBe(120);

  // Verify both payments were saved
  const paymentGetResponse = await page.request.get("/api/payments");
  expect(paymentGetResponse.ok()).toBeTruthy();
  const payments = await paymentGetResponse.json();
  const foundPix = payments.find(
    (record: { id: string }) => record.id === paymentPix.id
  );
  const foundCard = payments.find(
    (record: { id: string }) => record.id === paymentCard.id
  );
  expect(foundPix).toBeTruthy();
  expect(foundCard).toBeTruthy();
});

test("editar e deletar pagamento via API", async ({ page }) => {
  await page.goto("/login");

  await clerk.signIn({
    emailAddress: process.env.ESTETIQI_E2E_EMAIL!,
    page,
  });

  const unique = Date.now();
  const clientName = `Cliente Edit E2E ${unique}`;
  const procedureName = `Procedimento Edit E2E ${unique}`;
  const professionalName = `Profissional Edit E2E ${unique}`;

  // Create client
  const clientResponse = await page.request.post("/api/clients", {
    data: {
      name: clientName,
      phone: `(21) 9${String(unique).slice(-8)}`,
      email: `edit-${unique}@example.com`,
    },
  });

  expect(clientResponse.ok()).toBeTruthy();
  const client = (await clientResponse.json()).client;

  // Create procedure
  const procedureResponse = await page.request.post("/api/procedures", {
    data: {
      name: procedureName,
      price: 100,
      durationMinutes: 60,
    },
  });

  expect(procedureResponse.ok()).toBeTruthy();
  const procedure = (await procedureResponse.json()).procedure;

  // Create appointment
  const start = new Date();
  start.setDate(start.getDate() + 32);
  start.setHours(16, 0, 0, 0);

  const end = new Date(start);
  end.setHours(17, 0, 0, 0);

  const appointmentResponse = await page.request.post(
    "/api/appointments",
    {
      data: {
        clientId: client.id,
        procedureId: procedure.id,
        professionalName,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        price: 100,
        status: "completed",
      },
    }
  );

  expect(appointmentResponse.ok()).toBeTruthy();
  const appointmentId = (await appointmentResponse.json()).appointment.id;

  // Register a payment
  const paymentResponse = await page.request.post("/api/payments", {
    data: {
      clientId: client.id,
      appointmentId: appointmentId,
      procedureId: procedure.id,
      amount: 100,
      paymentMethod: "dinheiro",
      status: "paid",
    },
  });

  expect(paymentResponse.ok()).toBeTruthy();
  const payment = await paymentResponse.json();
  const paymentId = payment.id;

  // Update the payment
  const updateResponse = await page.request.patch(
    `/api/payments/${paymentId}`,
    {
      data: {
        amount: 80,
        paymentMethod: "pix",
      },
    }
  );

  expect(updateResponse.ok()).toBeTruthy();
  const updatedPayment = await updateResponse.json();
  expect(parseFloat(updatedPayment.amount)).toBe(80);
  expect(updatedPayment.payment_method).toBe("pix");

  // Delete the payment
  const deleteResponse = await page.request.delete(
    `/api/payments/${paymentId}`
  );

  expect(deleteResponse.ok()).toBeTruthy();

  // Verify payment was deleted
  const paymentGetResponse = await page.request.get("/api/payments");
  expect(paymentGetResponse.ok()).toBeTruthy();
  const payments = await paymentGetResponse.json();
  const notFoundPayment = payments.find(
    (record: { id: string }) => record.id === paymentId
  );
  expect(notFoundPayment).toBeUndefined();
});
