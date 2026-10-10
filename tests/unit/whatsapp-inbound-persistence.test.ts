// Testes unitários RÁPIDOS e SEM I/O da orquestração de persistência do webhook:
// mensagens RECEBIDAS e recibos de ENTREGA.
//
// As operações de banco são INJETADAS, então dá para verificar as regras sem
// tocar em banco algum:
//   1. TENANT: a organização vem sempre do número de destino resolvido no
//      servidor, nunca de dados enviados pelo cliente;
//   2. IDEMPOTÊNCIA: reenvio da Meta não duplica mensagem;
//   3. RESUMO HONESTO: stored / duplicates / unrouted refletem o que aconteceu.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  persistDeliveryEvents,
  persistInboundMessages,
} from "../../src/lib/communication/whatsapp-inbound.ts";
import type {
  InboundPersistenceDeps,
  InboundWhatsAppMessage,
  NewInboundMessage,
  StatusPersistenceDeps,
  WhatsAppDeliveryEvent,
} from "../../src/lib/communication/whatsapp-inbound.ts";

const ORGANIZATION_A = "org-a";
const ORGANIZATION_B = "org-b";
const PHONE_NUMBER_A = "PNID_A";
const PHONE_NUMBER_B = "PNID_B";

type InboundHarnessOptions = {
  organizationsByPhoneNumberId?: Record<string, string | null>;
  clientsByOrganizationAndDigits?: Record<string, string | null>;
  duplicateIds?: string[];
};

function inboundHarness(options: InboundHarnessOptions = {}) {
  const organizations = options.organizationsByPhoneNumberId ?? {};
  const clients = options.clientsByOrganizationAndDigits ?? {};
  const duplicateIds = new Set(options.duplicateIds ?? []);

  const resolvedPhoneNumberIds: string[] = [];
  const clientLookups: Array<{ organizationId: string; digits: string }> = [];
  const inserted: NewInboundMessage[] = [];

  const deps: InboundPersistenceDeps = {
    async resolveOrganizationId(phoneNumberId) {
      resolvedPhoneNumberIds.push(phoneNumberId);
      return organizations[phoneNumberId] ?? null;
    },
    async findClientIdByPhone(organizationId, digits) {
      clientLookups.push({ organizationId, digits });
      return clients[`${organizationId}:${digits}`] ?? null;
    },
    async insertInboundMessage(message) {
      if (duplicateIds.has(message.providerMessageId)) return false;
      inserted.push(message);
      return true;
    },
  };

  return { deps, resolvedPhoneNumberIds, clientLookups, inserted };
}

function inboundMessage(
  overrides: Partial<InboundWhatsAppMessage> = {},
): InboundWhatsAppMessage {
  return {
    providerMessageId: "wamid.1",
    phoneNumberId: PHONE_NUMBER_A,
    senderPhone: "5511988887777",
    messageType: "text",
    body: "Olá",
    eventAt: new Date("2025-01-01T00:00:00.000Z"),
    metadata: {},
    ...overrides,
  };
}

describe("persistInboundMessages", () => {
  it("grava a mensagem na organização dona do número de destino", async () => {
    const harness = inboundHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
      clientsByOrganizationAndDigits: {
        [`${ORGANIZATION_A}:5511988887777`]: "cliente-1",
      },
    });

    const summary = await persistInboundMessages(
      [inboundMessage()],
      harness.deps,
    );

    assert.deepEqual(summary, {
      received: 1,
      stored: 1,
      duplicates: 0,
      unrouted: 0,
    });
    assert.equal(harness.inserted.length, 1);
    assert.equal(harness.inserted[0].organizationId, ORGANIZATION_A);
    assert.equal(harness.inserted[0].clientId, "cliente-1");
    assert.equal(harness.inserted[0].senderPhone, "5511988887777");
  });

  it("não grava nada quando o número de destino está ausente", async () => {
    const harness = inboundHarness();

    const summary = await persistInboundMessages(
      [inboundMessage({ phoneNumberId: null })],
      harness.deps,
    );

    assert.deepEqual(summary, {
      received: 1,
      stored: 0,
      duplicates: 0,
      unrouted: 1,
    });
    assert.deepEqual(harness.resolvedPhoneNumberIds, []);
    assert.equal(harness.inserted.length, 0);
  });

  it("não grava em empresa alguma quando o número não está associado", async () => {
    const harness = inboundHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: null },
    });

    const summary = await persistInboundMessages(
      [inboundMessage()],
      harness.deps,
    );

    assert.deepEqual(summary, {
      received: 1,
      stored: 0,
      duplicates: 0,
      unrouted: 1,
    });
    assert.equal(harness.inserted.length, 0);
  });

  it("roteia cada mensagem pela organização do SEU número de destino", async () => {
    const harness = inboundHarness({
      organizationsByPhoneNumberId: {
        [PHONE_NUMBER_A]: ORGANIZATION_A,
        [PHONE_NUMBER_B]: ORGANIZATION_B,
      },
    });

    await persistInboundMessages(
      [
        inboundMessage({
          providerMessageId: "wamid.A",
          phoneNumberId: PHONE_NUMBER_A,
        }),
        inboundMessage({
          providerMessageId: "wamid.B",
          phoneNumberId: PHONE_NUMBER_B,
        }),
      ],
      harness.deps,
    );

    assert.deepEqual(
      harness.inserted.map(
        (message) => `${message.organizationId}:${message.providerMessageId}`,
      ),
      [`${ORGANIZATION_A}:wamid.A`, `${ORGANIZATION_B}:wamid.B`],
    );
  });

  it("não duplica mensagem já recebida (idempotência do webhook)", async () => {
    const harness = inboundHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
      duplicateIds: ["wamid.REPETIDA"],
    });

    const summary = await persistInboundMessages(
      [inboundMessage({ providerMessageId: "wamid.REPETIDA" })],
      harness.deps,
    );

    assert.deepEqual(summary, {
      received: 1,
      stored: 0,
      duplicates: 1,
      unrouted: 0,
    });
    assert.equal(harness.inserted.length, 0);
  });

  it("normaliza o telefone do remetente antes de buscar o cliente", async () => {
    const harness = inboundHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
    });

    await persistInboundMessages(
      [inboundMessage({ senderPhone: "+55 (11) 98888-7777" })],
      harness.deps,
    );

    assert.deepEqual(harness.clientLookups, [
      { organizationId: ORGANIZATION_A, digits: "5511988887777" },
    ]);
    assert.equal(harness.inserted[0].senderPhone, "5511988887777");
  });

  it("sem telefone do remetente não busca cliente e grava clientId nulo", async () => {
    const harness = inboundHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
    });

    await persistInboundMessages(
      [inboundMessage({ senderPhone: null })],
      harness.deps,
    );

    assert.deepEqual(harness.clientLookups, []);
    assert.equal(harness.inserted[0].clientId, null);
    assert.equal(harness.inserted[0].senderPhone, null);
  });

  it("não vincula cliente cadastrado em OUTRA organização", async () => {
    const harness = inboundHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
      clientsByOrganizationAndDigits: {
        [`${ORGANIZATION_B}:5511988887777`]: "cliente-de-outra-empresa",
      },
    });

    await persistInboundMessages([inboundMessage()], harness.deps);

    // A busca aconteceu NO escopo da organização dona do número...
    assert.deepEqual(harness.clientLookups, [
      { organizationId: ORGANIZATION_A, digits: "5511988887777" },
    ]);
    // ...portanto o cliente da outra empresa não foi vinculado.
    assert.equal(harness.inserted[0].clientId, null);
  });

  it("preserva tipo, conteúdo, horário e metadados da mensagem", async () => {
    const eventAt = new Date("2025-03-04T12:00:00.000Z");
    const harness = inboundHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
    });

    await persistInboundMessages(
      [
        inboundMessage({
          messageType: "image",
          body: "Olha o resultado!",
          eventAt,
          metadata: { replyToId: "wamid.ORIGINAL" },
        }),
      ],
      harness.deps,
    );

    assert.deepEqual(harness.inserted[0], {
      organizationId: ORGANIZATION_A,
      clientId: null,
      providerMessageId: "wamid.1",
      messageType: "image",
      body: "Olha o resultado!",
      eventAt,
      phoneNumberId: PHONE_NUMBER_A,
      senderPhone: "5511988887777",
      metadata: { replyToId: "wamid.ORIGINAL" },
    });
  });

  it("conta cada categoria do resumo dentro do mesmo lote", async () => {
    const harness = inboundHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
      duplicateIds: ["wamid.DUP"],
    });

    const summary = await persistInboundMessages(
      [
        inboundMessage({ providerMessageId: "wamid.OK" }),
        inboundMessage({ providerMessageId: "wamid.DUP" }),
        inboundMessage({ providerMessageId: "wamid.SEM_NUMERO", phoneNumberId: null }),
        inboundMessage({
          providerMessageId: "wamid.OUTRA_EMPRESA",
          phoneNumberId: PHONE_NUMBER_B,
        }),
      ],
      harness.deps,
    );

    assert.deepEqual(summary, {
      received: 4,
      stored: 1,
      duplicates: 1,
      unrouted: 2,
    });
  });

  it("processa lote vazio", async () => {
    const summary = await persistInboundMessages([], inboundHarness().deps);
    assert.deepEqual(summary, {
      received: 0,
      stored: 0,
      duplicates: 0,
      unrouted: 0,
    });
  });

  it("propaga erro real do banco e não mascara como sucesso", async () => {
    const deps: InboundPersistenceDeps = {
      async resolveOrganizationId() {
        return ORGANIZATION_A;
      },
      async findClientIdByPhone() {
        return null;
      },
      async insertInboundMessage() {
        throw new Error("falha real do banco");
      },
    };

    await assert.rejects(
      () => persistInboundMessages([inboundMessage()], deps),
      /falha real do banco/,
    );
  });
});

type DeliveryHarnessOptions = {
  organizationsByPhoneNumberId?: Record<string, string | null>;
  matchesExistingMessage?: boolean;
};

function deliveryHarness(options: DeliveryHarnessOptions = {}) {
  const organizations = options.organizationsByPhoneNumberId ?? {};
  const matches = options.matchesExistingMessage ?? true;

  const updates: Array<
    Parameters<StatusPersistenceDeps["updateMessageStatus"]>[0]
  > = [];

  const deps: StatusPersistenceDeps = {
    async resolveOrganizationId(phoneNumberId) {
      return organizations[phoneNumberId] ?? null;
    },
    async updateMessageStatus(update) {
      updates.push(update);
      return matches;
    },
  };

  return { deps, updates };
}

function deliveryEvent(
  overrides: Partial<WhatsAppDeliveryEvent> = {},
): WhatsAppDeliveryEvent {
  return {
    providerMessageId: "wamid.ENVIADA",
    status: "delivered",
    phoneNumberId: PHONE_NUMBER_A,
    recipientPhone: "5511988887777",
    eventAt: new Date("2025-01-01T00:00:00.000Z"),
    errorMessage: null,
    ...overrides,
  };
}

describe("persistDeliveryEvents", () => {
  it("atualiza o status da mensagem enviada na organização correta", async () => {
    const harness = deliveryHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
    });

    const summary = await persistDeliveryEvents(
      [deliveryEvent({ status: "read" })],
      harness.deps,
    );

    assert.deepEqual(summary, {
      received: 1,
      updated: 1,
      unchanged: 0,
      unrouted: 0,
    });
    assert.equal(harness.updates.length, 1);
    assert.equal(harness.updates[0].organizationId, ORGANIZATION_A);
    assert.equal(harness.updates[0].status, "read");
    assert.equal(harness.updates[0].rank, 3);
  });

  it("conta como inalterado quando não há mensagem correspondente", async () => {
    const harness = deliveryHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
      matchesExistingMessage: false,
    });

    const summary = await persistDeliveryEvents([deliveryEvent()], harness.deps);

    assert.deepEqual(summary, {
      received: 1,
      updated: 0,
      unchanged: 1,
      unrouted: 0,
    });
  });

  it("não atualiza nada quando o número de destino é desconhecido", async () => {
    const harness = deliveryHarness();

    const summary = await persistDeliveryEvents(
      [
        deliveryEvent({ phoneNumberId: null }),
        deliveryEvent({ providerMessageId: "wamid.OUTRO", phoneNumberId: PHONE_NUMBER_B }),
      ],
      harness.deps,
    );

    assert.deepEqual(summary, {
      received: 2,
      updated: 0,
      unchanged: 0,
      unrouted: 2,
    });
    assert.equal(harness.updates.length, 0);
  });

  it("envia ranque terminal e detalhe do erro para o banco", async () => {
    const harness = deliveryHarness({
      organizationsByPhoneNumberId: { [PHONE_NUMBER_A]: ORGANIZATION_A },
    });

    await persistDeliveryEvents(
      [deliveryEvent({ status: "failed", errorMessage: "Número inválido" })],
      harness.deps,
    );

    assert.equal(harness.updates[0].status, "failed");
    assert.equal(harness.updates[0].rank, 4);
    assert.equal(harness.updates[0].errorMessage, "Número inválido");
  });

  it("processa lote vazio", async () => {
    const summary = await persistDeliveryEvents([], deliveryHarness().deps);
    assert.deepEqual(summary, {
      received: 0,
      updated: 0,
      unchanged: 0,
      unrouted: 0,
    });
  });

  it("propaga erro real do banco e não mascara como sucesso", async () => {
    const deps: StatusPersistenceDeps = {
      async resolveOrganizationId() {
        return ORGANIZATION_A;
      },
      async updateMessageStatus() {
        throw new Error("falha real do banco");
      },
    };

    await assert.rejects(
      () => persistDeliveryEvents([deliveryEvent()], deps),
      /falha real do banco/,
    );
  });
});
