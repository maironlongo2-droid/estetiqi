// Testes unitários RÁPIDOS e SEM I/O do parsing das notificações do webhook
// oficial da Meta: mensagens RECEBIDAS e recibos de entrega das enviadas.
//
// MÓDULO PURO: nenhum banco, nenhuma rede e nenhum segredo. Rodam com o test
// runner nativo do Node (`npm run test:unit`).
//
// O parsing é uma barreira de segurança e de integridade:
//   1. decide QUAIS eventos viram caixa de entrada (recibo de entrega NÃO é
//      mensagem recebida);
//   2. define qual `phone_number_id` será usado para localizar a empresa;
//   3. nunca pode lançar (viraria 500 no webhook) nem inventar conteúdo.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  META_WHATSAPP_OBJECT,
  deliveryStatusRank,
  isWhatsAppDeliveryStatus,
  parseInboundWhatsAppMessages,
  parseWhatsAppDeliveryEvents,
} from "../../src/lib/communication/whatsapp-inbound.ts";

const PHONE_NUMBER_ID = "PNID_PRINCIPAL";
const SENDER = "5511988887777";
const TIMESTAMP = "1735689600";

type RawObject = Record<string, unknown>;

type PayloadOptions = {
  phoneNumberId?: string | null;
  statuses?: RawObject[];
  object?: unknown;
  messagingProduct?: unknown;
};

// Monta um corpo de webhook no formato oficial (resumido). Permite omitir partes
// para exercitar payloads incompletos e inesperados.
function webhookPayload(
  messages: RawObject[] | undefined,
  options: PayloadOptions = {},
) {
  const {
    phoneNumberId,
    statuses,
    object = META_WHATSAPP_OBJECT,
    messagingProduct = "whatsapp",
  } = options;

  const metadata =
    phoneNumberId === null
      ? {}
      : {
          display_phone_number: "5511999999999",
          phone_number_id: phoneNumberId ?? PHONE_NUMBER_ID,
        };

  const value: RawObject = { messaging_product: messagingProduct, metadata };
  if (messages) value.messages = messages;
  if (statuses) value.statuses = statuses;

  return {
    object,
    entry: [{ id: "WABA_ID", changes: [{ field: "messages", value }] }],
  };
}

function textMessage(overrides: RawObject = {}): RawObject {
  return {
    from: SENDER,
    id: "wamid.TEXTO",
    timestamp: TIMESTAMP,
    type: "text",
    text: { body: "Olá, quero agendar" },
    ...overrides,
  };
}

describe("parseInboundWhatsAppMessages", () => {
  it("extrai uma mensagem de texto recebida", () => {
    const messages = parseInboundWhatsAppMessages(
      webhookPayload([textMessage()]),
    );

    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0], {
      providerMessageId: "wamid.TEXTO",
      phoneNumberId: PHONE_NUMBER_ID,
      senderPhone: SENDER,
      messageType: "text",
      body: "Olá, quero agendar",
      eventAt: new Date(Number(TIMESTAMP) * 1000),
      metadata: {},
    });
  });

  it("nunca lança e devolve [] para payloads inesperados", () => {
    const inesperados: unknown[] = [
      null,
      undefined,
      42,
      "texto",
      [],
      {},
      { object: "page", entry: [] },
      { object: META_WHATSAPP_OBJECT, entry: "não-é-lista" },
      { object: META_WHATSAPP_OBJECT, entry: [null, 1, "x"] },
      webhookPayload([null as unknown as RawObject, "x" as unknown as RawObject]),
    ];

    for (const payload of inesperados) {
      assert.deepEqual(parseInboundWhatsAppMessages(payload), []);
    }
  });

  it("ignora eventos que não são do WhatsApp Business", () => {
    const payload = webhookPayload([textMessage()], { object: "page" });
    assert.deepEqual(parseInboundWhatsAppMessages(payload), []);
  });

  it("ignora mudanças cujo messaging_product não é whatsapp", () => {
    const payload = webhookPayload([textMessage()], {
      messagingProduct: "messenger",
    });
    assert.deepEqual(parseInboundWhatsAppMessages(payload), []);
  });

  it("ignora recibos de entrega (status não é caixa de entrada)", () => {
    const payload = webhookPayload(undefined, {
      statuses: [
        {
          id: "wamid.ENVIADA",
          recipient_id: SENDER,
          status: "delivered",
          timestamp: TIMESTAMP,
        },
      ],
    });

    assert.deepEqual(parseInboundWhatsAppMessages(payload), []);
  });

  it("mantém apenas as mensagens quando o corpo traz mensagens e status", () => {
    const payload = webhookPayload([textMessage()], {
      statuses: [{ id: "wamid.ENVIADA", status: "read" }],
    });

    const inbox = parseInboundWhatsAppMessages(payload);
    const receipts = parseWhatsAppDeliveryEvents(payload);

    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].providerMessageId, "wamid.TEXTO");
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].providerMessageId, "wamid.ENVIADA");
  });

  it("ignora mensagens sem id da Meta (não há como deduplicar)", () => {
    const payload = webhookPayload([textMessage({ id: undefined })]);
    assert.deepEqual(parseInboundWhatsAppMessages(payload), []);
  });

  it("usa 'unknown' quando a Meta não informa o tipo e não inventa conteúdo", () => {
    const payload = webhookPayload([
      textMessage({ type: undefined, text: undefined }),
    ]);

    const [message] = parseInboundWhatsAppMessages(payload);
    assert.equal(message.messageType, "unknown");
    assert.equal(message.body, null);
  });

  it("extrai a legenda quando a mídia recebida tem legenda", () => {
    const payload = webhookPayload([
      textMessage({
        type: "image",
        text: undefined,
        image: { id: "MEDIA_1", caption: "Olha o resultado!" },
      }),
    ]);

    const [message] = parseInboundWhatsAppMessages(payload);
    assert.equal(message.messageType, "image");
    assert.equal(message.body, "Olha o resultado!");
  });

  it("não atribui texto a tipos sem texto (áudio)", () => {
    const payload = webhookPayload([
      textMessage({ type: "audio", text: undefined, audio: { id: "MEDIA_2" } }),
    ]);

    const [message] = parseInboundWhatsAppMessages(payload);
    assert.equal(message.messageType, "audio");
    assert.equal(message.body, null);
  });

  it("registra o id da mensagem citada em resposta", () => {
    const payload = webhookPayload([
      textMessage({ context: { from: SENDER, id: "wamid.ORIGINAL" } }),
    ]);

    const [message] = parseInboundWhatsAppMessages(payload);
    assert.deepEqual(message.metadata, { replyToId: "wamid.ORIGINAL" });
  });

  it("converte o timestamp da Meta em Date e aceita número", () => {
    const payload = webhookPayload([
      textMessage({ id: "wamid.SEG", timestamp: 1735689601 }),
    ]);

    const [message] = parseInboundWhatsAppMessages(payload);
    assert.deepEqual(message.eventAt, new Date(1735689601 * 1000));
  });

  it("devolve eventAt nulo para timestamp ausente ou inválido", () => {
    const payload = webhookPayload([
      textMessage({ id: "wamid.A", timestamp: undefined }),
      textMessage({ id: "wamid.B", timestamp: "não-é-número" }),
      textMessage({ id: "wamid.C", timestamp: "0" }),
      textMessage({ id: "wamid.D", timestamp: "-10" }),
    ]);

    const messages = parseInboundWhatsAppMessages(payload);
    assert.equal(messages.length, 4);
    for (const message of messages) {
      assert.equal(message.eventAt, null);
    }
  });

  it("devolve phoneNumberId nulo quando o metadata não informa o número", () => {
    const payload = webhookPayload([textMessage()], { phoneNumberId: null });

    const [message] = parseInboundWhatsAppMessages(payload);
    assert.equal(message.phoneNumberId, null);
  });

  it("acumula mensagens de várias entradas preservando o número de destino", () => {
    const change = (phoneNumberId: string, id: string) => ({
      field: "messages",
      value: {
        messaging_product: "whatsapp",
        metadata: { phone_number_id: phoneNumberId },
        messages: [textMessage({ id })],
      },
    });

    const payload = {
      object: META_WHATSAPP_OBJECT,
      entry: [
        {
          id: "WABA_A",
          changes: [change("PNID_A", "wamid.A"), change("PNID_A", "wamid.B")],
        },
        { id: "WABA_B", changes: [change("PNID_B", "wamid.C")] },
      ],
    };

    const messages = parseInboundWhatsAppMessages(payload);
    assert.deepEqual(
      messages.map(
        (message) => `${message.phoneNumberId}:${message.providerMessageId}`,
      ),
      ["PNID_A:wamid.A", "PNID_A:wamid.B", "PNID_B:wamid.C"],
    );
  });
});

describe("parseWhatsAppDeliveryEvents", () => {
  it("extrai um recibo de entrega com destinatário e horário", () => {
    const payload = webhookPayload(undefined, {
      statuses: [
        {
          id: "wamid.ENVIADA",
          recipient_id: SENDER,
          status: "delivered",
          timestamp: TIMESTAMP,
        },
      ],
    });

    const receipts = parseWhatsAppDeliveryEvents(payload);
    assert.equal(receipts.length, 1);
    assert.deepEqual(receipts[0], {
      providerMessageId: "wamid.ENVIADA",
      status: "delivered",
      phoneNumberId: PHONE_NUMBER_ID,
      recipientPhone: SENDER,
      eventAt: new Date(Number(TIMESTAMP) * 1000),
      errorMessage: null,
    });
  });

  it("ignora status desconhecido pela Meta", () => {
    const payload = webhookPayload(undefined, {
      statuses: [
        { id: "wamid.A", status: "deleted", timestamp: TIMESTAMP },
        { id: "wamid.B", status: "delivered", timestamp: TIMESTAMP },
      ],
    });

    const receipts = parseWhatsAppDeliveryEvents(payload);
    assert.deepEqual(
      receipts.map((receipt) => receipt.providerMessageId),
      ["wamid.B"],
    );
  });

  it("ignora recibos sem id da Meta", () => {
    const payload = webhookPayload(undefined, {
      statuses: [{ id: undefined, status: "sent", timestamp: TIMESTAMP }],
    });

    assert.deepEqual(parseWhatsAppDeliveryEvents(payload), []);
  });

  it("extrai o detalhe do erro quando a Meta informa", () => {
    const payload = webhookPayload(undefined, {
      statuses: [
        {
          id: "wamid.FALHA",
          status: "failed",
          timestamp: TIMESTAMP,
          errors: [
            {
              code: 131047,
              title: "Re-engagement",
              message: "Mensagem não entregue",
              error_data: { details: "Mais de 24h desde a última interação" },
            },
          ],
        },
      ],
    });

    const [receipt] = parseWhatsAppDeliveryEvents(payload);
    assert.equal(receipt.status, "failed");
    assert.equal(receipt.errorMessage, "Mais de 24h desde a última interação");
  });

  it("usa a mensagem do erro quando não há detalhe", () => {
    const payload = webhookPayload(undefined, {
      statuses: [
        {
          id: "wamid.FALHA",
          status: "failed",
          errors: [{ title: "Falha", message: "Número inválido" }],
        },
      ],
    });

    const [receipt] = parseWhatsAppDeliveryEvents(payload);
    assert.equal(receipt.errorMessage, "Número inválido");
  });

  it("devolve phoneNumberId nulo quando o metadata não informa o número", () => {
    const payload = webhookPayload(undefined, {
      phoneNumberId: null,
      statuses: [{ id: "wamid.A", status: "sent" }],
    });

    const [receipt] = parseWhatsAppDeliveryEvents(payload);
    assert.equal(receipt.phoneNumberId, null);
  });

  it("nunca lança e devolve [] para payloads inesperados", () => {
    const inesperados: unknown[] = [
      null,
      undefined,
      7,
      "texto",
      [],
      {},
      { object: "page", entry: [] },
      webhookPayload([textMessage()]),
      webhookPayload(undefined, {
        object: "page",
        statuses: [{ id: "x", status: "sent" }],
      }),
      webhookPayload(undefined, { statuses: [null as unknown as RawObject] }),
    ];

    for (const payload of inesperados) {
      assert.deepEqual(parseWhatsAppDeliveryEvents(payload), []);
    }
  });
});

describe("deliveryStatusRank / isWhatsAppDeliveryStatus", () => {
  it("reconhece apenas os status oficiais de entrega", () => {
    for (const status of ["sent", "delivered", "read", "failed"]) {
      assert.equal(isWhatsAppDeliveryStatus(status), true);
    }

    for (const status of ["deleted", "received", "sent ", "", null, 1]) {
      assert.equal(isWhatsAppDeliveryStatus(status), false);
    }
  });

  it("nunca retrocede o status: a ordem de avanço é estável", () => {
    assert.ok(deliveryStatusRank("sent") < deliveryStatusRank("delivered"));
    assert.ok(deliveryStatusRank("delivered") < deliveryStatusRank("read"));
  });

  it("trata 'failed' como terminal (maior ranque)", () => {
    assert.ok(deliveryStatusRank("failed") > deliveryStatusRank("read"));
  });
});
