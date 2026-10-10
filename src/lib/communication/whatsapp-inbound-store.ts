// Persistência das mensagens RECEBIDAS do WhatsApp (webhook da Meta).
//
// MÓDULO EXCLUSIVO DO SERVIDOR. A assinatura do webhook já foi validada na rota
// antes de qualquer chamada aqui, portanto só chegam eventos genuínos da Meta.
//
// ISOLAMENTO MULTIEMPRESA: a organização NUNCA vem do corpo da requisição. Ela
// é resolvida a partir do `phone_number_id` informado pela Meta e da tabela
// `whatsapp_integrations`. Se o número não estiver associado a exatamente uma
// integração, o evento NÃO é associado a empresa nenhuma (é descartado), para
// não correr o risco de revelar a mensagem para a organização errada.
//
// IDEMPOTÊNCIA: a Meta pode reenviar o mesmo evento. A tabela
// `communication_messages` possui índice único em (organization_id,
// provider_message_id); usamos INSERT ... ON CONFLICT DO NOTHING para que o
// mesmo identificador nunca gere dois registros.
//
// FALHAS DE BANCO NÃO VIRAM SUCESSO: qualquer erro de acesso ao banco é
// propagado; a rota responde com erro para que a Meta saiba que a mensagem
// ainda NÃO foi armazenada. Nenhum segredo, token ou dado pessoal é registrado
// aqui.

import { sql } from "@/lib/db/client";
import {
  parseInboundWhatsAppMessages,
  parseWhatsAppDeliveryEvents,
  persistDeliveryEvents,
  persistInboundMessages,
  type InboundPersistenceDeps,
  type InboundPersistenceSummary,
  type NewInboundMessage,
  type StatusPersistenceDeps,
  type StatusPersistenceSummary,
  type WhatsAppDeliveryStatus,
} from "@/lib/communication/whatsapp-inbound";
import {
  resolveOrganizationIdByPhoneNumberId,
  touchIntegrationWebhooks,
} from "@/lib/communication/whatsapp-integration-store";

// O roteamento (phone_number_id -> organização) é centralizado no armazenamento
// da integração para existir UMA única regra de segurança: exigir correspondência
// inequívoca e nunca associar o evento à empresa errada.

// Vincula a cliente pelo telefone, dentro da própria organização. Exige
// exatamente uma correspondência (ignorando formatação) para não ligar a
// mensagem a uma cliente errada.
async function findClientIdByPhone(
  organizationId: string,
  digits: string
): Promise<string | null> {
  const rows = (await sql`
    SELECT id
    FROM clients
    WHERE organization_id = ${organizationId}
      AND phone IS NOT NULL
      AND regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}
    LIMIT 2
  `) as { id: string }[];

  return rows.length === 1 ? rows[0].id : null;
}

// Grava a mensagem recebida. `ON CONFLICT ... DO NOTHING` sobre o índice único
// parcial de idempotência faz com que uma reentrega da Meta não crie duplicata.
async function insertInboundMessage(
  message: NewInboundMessage
): Promise<boolean> {
  const eventAt = message.eventAt ? message.eventAt.toISOString() : null;

  const rows = (await sql`
    INSERT INTO communication_messages (
      organization_id,
      client_id,
      channel,
      direction,
      category,
      status,
      body,
      provider_message_id,
      message_type,
      event_at,
      whatsapp_phone_number_id,
      sender_phone,
      metadata,
      source,
      created_at
    ) VALUES (
      ${message.organizationId},
      ${message.clientId},
      'whatsapp',
      'inbound',
      'atendimento',
      'received',
      ${message.body},
      ${message.providerMessageId},
      ${message.messageType},
      ${eventAt}::timestamptz,
      ${message.phoneNumberId},
      ${message.senderPhone},
      ${JSON.stringify(message.metadata)}::jsonb,
      'whatsapp_webhook',
      NOW()
    )
    ON CONFLICT (organization_id, provider_message_id)
      WHERE provider_message_id IS NOT NULL
      DO NOTHING
    RETURNING id
  `) as { id: string }[];

  return rows.length > 0;
}

const defaultDeps: InboundPersistenceDeps = {
  resolveOrganizationId: resolveOrganizationIdByPhoneNumberId,
  findClientIdByPhone,
  insertInboundMessage,
};

// Ponto de entrada usado pela rota do webhook: interpreta o corpo da Meta e
// persiste as mensagens recebidas. Propaga erros de banco para que a rota não
// confirme sucesso sem ter armazenado de fato.
export async function storeInboundWhatsAppEvents(
  payload: unknown
): Promise<InboundPersistenceSummary> {
  const messages = parseInboundWhatsAppMessages(payload);
  return persistInboundMessages(messages, defaultDeps);
}

// Atualiza o status das mensagens ENVIADAS a partir dos recibos de entrega da
// Meta. O status SÓ avança (nunca retrocede): o ranque é comparado no banco, de
// modo que eventos fora de ordem não rebaixam um "lido" para "entregue".
async function updateMessageStatus(update: {
  organizationId: string;
  providerMessageId: string;
  status: WhatsAppDeliveryStatus;
  rank: number;
  eventAt: Date | null;
  errorMessage: string | null;
}): Promise<boolean> {
  const eventAt = update.eventAt ? update.eventAt.toISOString() : null;

  const rows = (await sql`
    UPDATE communication_messages
    SET status = ${update.status},
        delivered_at = CASE
          WHEN ${update.status} = 'delivered' THEN ${eventAt}::timestamptz
          ELSE delivered_at
        END,
        read_at = CASE
          WHEN ${update.status} = 'read' THEN ${eventAt}::timestamptz
          ELSE read_at
        END,
        error_message = CASE
          WHEN ${update.status} = 'failed' THEN ${update.errorMessage}
          ELSE error_message
        END,
        updated_at = NOW()
    WHERE organization_id = ${update.organizationId}
      AND provider_message_id = ${update.providerMessageId}
      AND direction = 'outbound'
      AND ${update.rank} >= CASE status
        WHEN 'read' THEN 3
        WHEN 'delivered' THEN 2
        WHEN 'sent' THEN 1
        WHEN 'failed' THEN 4
        ELSE 0
      END
    RETURNING id
  `) as { id: string }[];

  return rows.length > 0;
}

const statusDeps: StatusPersistenceDeps = {
  resolveOrganizationId: resolveOrganizationIdByPhoneNumberId,
  updateMessageStatus,
};

// Ponto de entrada do webhook para os recibos de entrega. Propaga erros de banco
// (a rota não confirma sucesso sem ter armazenado de fato).
export async function storeWhatsAppDeliveryEvents(
  payload: unknown
): Promise<StatusPersistenceSummary> {
  const events = parseWhatsAppDeliveryEvents(payload);
  return persistDeliveryEvents(events, statusDeps);
}

// Resumo combinado do webhook (mensagens recebidas + recibos de entrega).
export type WhatsAppWebhookSummary = {
  messages: InboundPersistenceSummary;
  statuses: StatusPersistenceSummary;
};

// Ponto de entrada ÚNICO da rota do webhook: interpreta o corpo da Meta uma vez,
// persiste mensagens recebidas e recibos de entrega e, por fim, atualiza o
// "visto por último" das integrações envolvidas (best-effort, não crítico).
export async function storeWhatsAppWebhookEvents(
  payload: unknown
): Promise<WhatsAppWebhookSummary> {
  const inboundMessages = parseInboundWhatsAppMessages(payload);
  const deliveryEvents = parseWhatsAppDeliveryEvents(payload);

  const messages = await persistInboundMessages(inboundMessages, defaultDeps);
  const statuses = await persistDeliveryEvents(deliveryEvents, statusDeps);

  const phoneNumberIds = [
    ...inboundMessages.map((message) => message.phoneNumberId),
    ...deliveryEvents.map((event) => event.phoneNumberId),
  ].filter((id): id is string => Boolean(id));

  try {
    await touchIntegrationWebhooks(phoneNumberIds);
  } catch {
    // Best-effort: falhar ao registrar o "visto por último" não invalida o
    // processamento — as mensagens já foram persistidas.
  }

  return { messages, statuses };
}
