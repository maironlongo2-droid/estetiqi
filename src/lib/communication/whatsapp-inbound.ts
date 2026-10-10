// Leitura (parsing) das notificações de mensagens RECEBIDAS vindas do webhook
// oficial da Meta (WhatsApp Business Cloud API).
//
// MÓDULO PURO: não acessa banco, rede nem segredos e NUNCA lança. Recebe o
// corpo já validado (assinatura conferida na rota) e já convertido em objeto,
// e devolve apenas mensagens enviadas por clientes (inbound). Atualizações de
// status de mensagens enviadas (`statuses`) são deliberadamente IGNORADAS nesta
// etapa: elas não são mensagens recebidas e não devem virar caixa de entrada.
//
// Estrutura oficial (resumida) de um evento do campo `messages`:
//   payload.object ............................ "whatsapp_business_account"
//   payload.entry[]............................ lotes enviados pela Meta
//   entry.changes[].value.messaging_product .... "whatsapp"
//   entry.changes[].value.metadata.phone_number_id -> número que RECEBEU
//   entry.changes[].value.messages[] .......... mensagens recebidas
//     message.id .............................. identificador único (idempotência)
//     message.from ............................ número de quem enviou (wa_id)
//     message.timestamp ....................... data/hora do evento (segundos)
//     message.type ............................ text, image, audio, document, ...
//     message.text.body / media.caption ....... conteúdo textual quando existir
//
// A organização NÃO é decidida aqui: este módulo apenas devolve o
// `phoneNumberId` recebido, que a camada de persistência usa para localizar a
// integração e a empresa dona do número.

export const META_WHATSAPP_OBJECT = "whatsapp_business_account";

export type InboundWhatsAppMessage = {
  // Identificador único da mensagem segundo a Meta (base da idempotência).
  providerMessageId: string;
  // Número de WhatsApp que RECEBEU a mensagem (roteamento por organização).
  phoneNumberId: string | null;
  // Número (wa_id) de quem enviou. Pode estar ausente em eventos incompletos.
  senderPhone: string | null;
  // Tipo informado pela Meta (text, image, audio, document, interactive, ...).
  messageType: string;
  // Conteúdo textual quando disponível (texto ou legenda de mídia); caso
  // contrário null. Nunca inventamos conteúdo para tipos sem texto.
  body: string | null;
  // Data/hora do evento informada pela Meta. null quando ausente/ inválida.
  eventAt: Date | null;
  // Metadados mínimos para processamento futuro (ex.: id da mensagem citada).
  metadata: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// Converte o `timestamp` da Meta (segundos Unix, como texto) em Date. Devolve
// null para valores ausentes ou inválidos em vez de lançar.
function parseEventTimestamp(value: unknown): Date | null {
  const raw =
    asString(value) ?? (typeof value === "number" ? String(value) : null);
  if (!raw) return null;

  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Extrai o conteúdo textual disponível. Para texto é `text.body`; para mídia
// (imagem/vídeo/documento) é a legenda, quando existir. Outros tipos não têm
// texto e devolvem null (o evento continua sendo armazenado pelo envelope).
function extractBody(
  message: Record<string, unknown>,
  type: string
): string | null {
  if (type === "text") {
    const text = message.text;
    if (isRecord(text)) return asString(text.body);
  }

  for (const key of ["image", "video", "document"]) {
    const media = message[key];
    if (isRecord(media)) {
      const caption = asString(media.caption);
      if (caption) return caption;
    }
  }

  return null;
}

// Extrai as mensagens recebidas de clientes. Devolve [] para qualquer payload
// inesperado (objeto diferente, listas ausentes, entradas inválidas, apenas
// atualizações de status), sem lançar.
export function parseInboundWhatsAppMessages(
  payload: unknown
): InboundWhatsAppMessage[] {
  if (!isRecord(payload)) return [];
  if (payload.object !== META_WHATSAPP_OBJECT) return [];

  const result: InboundWhatsAppMessage[] = [];

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) continue;

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change)) continue;

      const value = change.value;
      if (!isRecord(value)) continue;
      if (value.messaging_product !== "whatsapp") continue;

      const metadata = isRecord(value.metadata) ? value.metadata : null;
      const phoneNumberId = asString(
        metadata ? metadata.phone_number_id : null
      );

      for (const rawMessage of asArray(value.messages)) {
        if (!isRecord(rawMessage)) continue;

        // Sem identificador da Meta não há como deduplicar: ignoramos o evento.
        const providerMessageId = asString(rawMessage.id);
        if (!providerMessageId) continue;

        const messageType = asString(rawMessage.type) ?? "unknown";

        const messageMetadata: Record<string, unknown> = {};
        if (isRecord(rawMessage.context)) {
          const replyToId = asString(rawMessage.context.id);
          if (replyToId) messageMetadata.replyToId = replyToId;
        }

        result.push({
          providerMessageId,
          phoneNumberId,
          senderPhone: asString(rawMessage.from),
          messageType,
          body: extractBody(rawMessage, messageType),
          eventAt: parseEventTimestamp(rawMessage.timestamp),
          metadata: messageMetadata,
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Orquestração da persistência (PURO / sem I/O).
//
// Define o modelo da mensagem a gravar e a regra de roteamento por organização e
// de idempotência, com as operações de banco INJETADAS. Assim a regra de
// segurança (nunca associar à empresa errada) e a de não duplicação podem ser
// verificadas sem tocar em banco algum.
// ---------------------------------------------------------------------------

// Resumo do processamento de uma notificação. Contém apenas contagens, para
// poder ser registrado em log sem expor dados pessoais.
export type InboundPersistenceSummary = {
  received: number;
  stored: number;
  duplicates: number;
  unrouted: number;
};

export type NewInboundMessage = {
  organizationId: string;
  clientId: string | null;
  providerMessageId: string;
  messageType: string;
  body: string | null;
  eventAt: Date | null;
  phoneNumberId: string;
  senderPhone: string | null;
  metadata: Record<string, unknown>;
};

// Operações de banco injetadas. Em produção usam os acessos padrão do projeto.
export type InboundPersistenceDeps = {
  // Devolve a organização dona do número, ou null quando não for inequívoco.
  resolveOrganizationId: (phoneNumberId: string) => Promise<string | null>;
  // Devolve o cliente correspondente dentro da organização, ou null.
  findClientIdByPhone: (
    organizationId: string,
    digits: string
  ) => Promise<string | null>;
  // Devolve true quando a linha foi inserida e false quando já existia.
  insertInboundMessage: (message: NewInboundMessage) => Promise<boolean>;
};

function digitsOnly(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length ? digits : null;
}

// Orquestra a persistência: resolve a organização pelo número de destino, tenta
// vincular a cliente pelo telefone e grava de forma idempotente. Erros reais de
// banco lançados por `deps` são propagados ao chamador.
export async function persistInboundMessages(
  messages: InboundWhatsAppMessage[],
  deps: InboundPersistenceDeps
): Promise<InboundPersistenceSummary> {
  const summary: InboundPersistenceSummary = {
    received: messages.length,
    stored: 0,
    duplicates: 0,
    unrouted: 0,
  };

  for (const message of messages) {
    // Sem o número de destino não há como identificar a empresa com segurança.
    if (!message.phoneNumberId) {
      summary.unrouted += 1;
      continue;
    }

    const organizationId = await deps.resolveOrganizationId(
      message.phoneNumberId
    );

    if (!organizationId) {
      summary.unrouted += 1;
      continue;
    }

    const digits = digitsOnly(message.senderPhone);
    const clientId = digits
      ? await deps.findClientIdByPhone(organizationId, digits)
      : null;

    const inserted = await deps.insertInboundMessage({
      organizationId,
      clientId,
      providerMessageId: message.providerMessageId,
      messageType: message.messageType,
      body: message.body,
      eventAt: message.eventAt,
      phoneNumberId: message.phoneNumberId,
      senderPhone: digits,
      metadata: message.metadata,
    });

    if (inserted) {
      summary.stored += 1;
    } else {
      summary.duplicates += 1;
    }
  }

  return summary;
}

// ---------------------------------------------------------------------------
// Atualizações de STATUS das mensagens ENVIADAS (delivery receipts).
//
// No mesmo webhook a Meta informa o andamento das mensagens que NÓS enviamos:
// sent (aceita), delivered (entregue), read (lida) e failed (falha). Estes
// eventos NÃO são mensagens recebidas — por isso vivem em uma seção separada e
// nunca viram caixa de entrada.
// ---------------------------------------------------------------------------

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";

const DELIVERY_STATUSES: readonly WhatsAppDeliveryStatus[] = [
  "sent",
  "delivered",
  "read",
  "failed",
];

export function isWhatsAppDeliveryStatus(
  value: unknown
): value is WhatsAppDeliveryStatus {
  return (
    typeof value === "string" &&
    (DELIVERY_STATUSES as readonly string[]).includes(value)
  );
}

// Ranque de avanço do status. Serve para NÃO retroceder: quando a Meta entrega
// eventos fora de ordem, o status mais avançado prevalece (ex.: "lido" não volta
// para "entregue"). "failed" é tratado como terminal.
export function deliveryStatusRank(status: WhatsAppDeliveryStatus): number {
  switch (status) {
    case "sent":
      return 1;
    case "delivered":
      return 2;
    case "read":
      return 3;
    case "failed":
      return 4;
    default:
      return 0;
  }
}

export type WhatsAppDeliveryEvent = {
  providerMessageId: string;
  status: WhatsAppDeliveryStatus;
  phoneNumberId: string | null;
  recipientPhone: string | null;
  eventAt: Date | null;
  errorMessage: string | null;
};

function extractDeliveryError(value: unknown): string | null {
  const first = asArray(value)[0];
  if (!isRecord(first)) return null;
  const errorData = isRecord(first.error_data) ? first.error_data : null;
  return (
    (errorData ? asString(errorData.details) : null) ??
    asString(first.message) ??
    asString(first.title)
  );
}

// Extrai as atualizações de status do corpo do webhook. Devolve [] para qualquer
// payload inesperado (objeto diferente, apenas mensagens recebidas, entradas
// inválidas), sem lançar.
export function parseWhatsAppDeliveryEvents(
  payload: unknown
): WhatsAppDeliveryEvent[] {
  if (!isRecord(payload)) return [];
  if (payload.object !== META_WHATSAPP_OBJECT) return [];

  const result: WhatsAppDeliveryEvent[] = [];

  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) continue;

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change)) continue;

      const value = change.value;
      if (!isRecord(value)) continue;
      if (value.messaging_product !== "whatsapp") continue;

      const metadata = isRecord(value.metadata) ? value.metadata : null;
      const phoneNumberId = asString(
        metadata ? metadata.phone_number_id : null
      );

      for (const rawStatus of asArray(value.statuses)) {
        if (!isRecord(rawStatus)) continue;

        const providerMessageId = asString(rawStatus.id);
        if (!providerMessageId) continue;
        if (!isWhatsAppDeliveryStatus(rawStatus.status)) continue;

        result.push({
          providerMessageId,
          status: rawStatus.status,
          phoneNumberId,
          recipientPhone: asString(rawStatus.recipient_id),
          eventAt: parseEventTimestamp(rawStatus.timestamp),
          errorMessage: extractDeliveryError(rawStatus.errors),
        });
      }
    }
  }

  return result;
}

// Orquestração da atualização de status (PURO / sem I/O), com as operações de
// banco injetadas — mesma regra de segurança de roteamento por organização
// usada para as mensagens recebidas.
export type StatusPersistenceSummary = {
  received: number;
  updated: number;
  unchanged: number;
  unrouted: number;
};

export type StatusPersistenceDeps = {
  resolveOrganizationId: (phoneNumberId: string) => Promise<string | null>;
  // Atualiza o status da mensagem ENVIADA correspondente. Devolve true quando
  // havia uma linha correspondente e o status avançou; false caso contrário.
  updateMessageStatus: (update: {
    organizationId: string;
    providerMessageId: string;
    status: WhatsAppDeliveryStatus;
    rank: number;
    eventAt: Date | null;
    errorMessage: string | null;
  }) => Promise<boolean>;
};

export async function persistDeliveryEvents(
  events: WhatsAppDeliveryEvent[],
  deps: StatusPersistenceDeps
): Promise<StatusPersistenceSummary> {
  const summary: StatusPersistenceSummary = {
    received: events.length,
    updated: 0,
    unchanged: 0,
    unrouted: 0,
  };

  for (const event of events) {
    // Sem o número de destino não há como identificar a empresa com segurança.
    if (!event.phoneNumberId) {
      summary.unrouted += 1;
      continue;
    }

    const organizationId = await deps.resolveOrganizationId(
      event.phoneNumberId
    );

    if (!organizationId) {
      summary.unrouted += 1;
      continue;
    }

    const changed = await deps.updateMessageStatus({
      organizationId,
      providerMessageId: event.providerMessageId,
      status: event.status,
      rank: deliveryStatusRank(event.status),
      eventAt: event.eventAt,
      errorMessage: event.errorMessage,
    });

    if (changed) {
      summary.updated += 1;
    } else {
      summary.unchanged += 1;
    }
  }

  return summary;
}
