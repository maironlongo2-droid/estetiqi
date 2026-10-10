// Envio dos protocolos de procedimento (PDF) pela comunicação oficial que já
// existe no produto (WhatsApp Business Cloud API, por organização).
//
// NÃO é um segundo sistema de mensageria: reutiliza as credenciais já cifradas da
// organização (`whatsapp-integration-store`) e a camada de envio
// (`whatsapp-send`).
//
// Regras de honestidade e segurança:
// - NUNCA lança: devolve um resultado explícito e o fluxo do agendamento segue
//   normalmente, mesmo se o envio falhar.
// - Só considera "enviado" quando a Meta confirma (identificador da mensagem).
// - Sem canal conectado, registra "unavailable" com o motivo real.
// - Não envia para agendamento cancelado ou com falta da cliente.
// - Não duplica envio: o índice único do banco (protocolo + agendamento +
//   gatilho) garante um registro por evento; uma nova tentativa apenas atualiza o
//   mesmo registro (contador de tentativas), nunca cria um segundo.
// - `organization_id` vem sempre do usuário autenticado (a rota passa); nada aqui
//   confia em identificadores enviados pelo navegador.

import { sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/pg-errors";
import { readOrganizationWhatsAppCredentials } from "@/lib/communication/whatsapp-integration-store";
import { sendWhatsAppDocument } from "@/lib/communication/whatsapp-send";
import {
  loadProtocolFile,
  readProtocolSchemaReadiness,
} from "@/lib/protocols/protocol-store";

export type ProtocolDeliveryTrigger = "pre_appointment" | "post_appointment";

export type ProtocolDeliveryOutcome = {
  status: "sent" | "failed" | "unavailable" | "skipped" | "schema_pending";
  detail: string;
  sent: number;
  attempted: number;
};

const SCHEMA_PENDING_DETAIL =
  "A migration 034 ainda não foi aplicada neste ambiente, por isso o envio de protocolos não está ativo.";

// Reserva o registro de envio (idempotente). Devolve o id do registro a ser
// atualizado ou null quando o protocolo já foi confirmado como enviado para este
// agendamento/gatilho (nesse caso não há novo envio).
async function reserveDelivery(input: {
  organizationId: string;
  protocolId: string;
  appointmentId: string;
  clientId: string | null;
  trigger: ProtocolDeliveryTrigger;
}): Promise<string | null> {
  const { organizationId, protocolId, appointmentId, clientId, trigger } = input;

  const existing = (await sql`
    SELECT id, status
    FROM procedure_protocol_deliveries
    WHERE organization_id = ${organizationId}
      AND protocol_id = ${protocolId}
      AND appointment_id = ${appointmentId}
      AND trigger_type = ${trigger}
    LIMIT 1
  `) as { id: string; status: string }[];

  const current = existing[0];
  if (current) {
    if (current.status === "sent") return null;
    const updated = (await sql`
      UPDATE procedure_protocol_deliveries
      SET attempts = attempts + 1, last_attempt_at = NOW(), updated_at = NOW()
      WHERE id = ${current.id}
        AND organization_id = ${organizationId}
      RETURNING id
    `) as { id: string }[];
    return updated[0]?.id ?? null;
  }

  try {
    const inserted = (await sql`
      INSERT INTO procedure_protocol_deliveries (
        organization_id,
        protocol_id,
        appointment_id,
        client_id,
        trigger_type,
        status
      )
      VALUES (
        ${organizationId},
        ${protocolId},
        ${appointmentId},
        ${clientId},
        ${trigger},
        'pending'
      )
      RETURNING id
    `) as { id: string }[];
    return inserted[0]?.id ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Corrida: outra tentativa registrou o mesmo envio. Reaproveita o registro.
      const retry = (await sql`
        SELECT id, status
        FROM procedure_protocol_deliveries
        WHERE organization_id = ${organizationId}
          AND protocol_id = ${protocolId}
          AND appointment_id = ${appointmentId}
          AND trigger_type = ${trigger}
        LIMIT 1
      `) as { id: string; status: string }[];
      if (retry[0]?.status === "sent") return null;
      return retry[0]?.id ?? null;
    }
    throw error;
  }
}

async function finishDelivery(input: {
  organizationId: string;
  deliveryId: string;
  status: "sent" | "failed" | "unavailable";
  detail: string;
  providerMessageId?: string | null;
}): Promise<void> {
  await sql`
    UPDATE procedure_protocol_deliveries
    SET
      status = ${input.status},
      detail = ${input.detail.slice(0, 500)},
      provider_message_id = ${input.providerMessageId ?? null},
      updated_at = NOW()
    WHERE id = ${input.deliveryId}
      AND organization_id = ${input.organizationId}
  `;
}

function skipped(detail: string): ProtocolDeliveryOutcome {
  return { status: "skipped", detail, sent: 0, attempted: 0 };
}

// Executa o envio configurado para um agendamento. Quando `protocolId` é
// informado, apenas esse protocolo é considerado (usado pela nova tentativa
// manual na tela de Procedimentos).
export async function deliverProtocolsForAppointment(input: {
  organizationId: string;
  appointmentId: string;
  trigger: ProtocolDeliveryTrigger;
  protocolId?: string | null;
}): Promise<ProtocolDeliveryOutcome> {
  const { organizationId, appointmentId, trigger, protocolId } = input;

  try {
    const readiness = await readProtocolSchemaReadiness();
    if (!readiness.ready) {
      return {
        status: "schema_pending",
        detail: SCHEMA_PENDING_DETAIL,
        sent: 0,
        attempted: 0,
      };
    }

    const appointments = (await sql`
      SELECT
        a.id,
        a.status,
        a.client_id,
        c.name AS client_name,
        c.phone AS client_phone
      FROM appointments a
      JOIN clients c
        ON c.id = a.client_id
       AND c.organization_id = a.organization_id
      WHERE a.id = ${appointmentId}
        AND a.organization_id = ${organizationId}
      LIMIT 1
    `) as {
      id: string;
      status: string;
      client_id: string | null;
      client_name: string | null;
      client_phone: string | null;
    }[];

    const appointment = appointments[0];
    if (!appointment) {
      return skipped("Agendamento não encontrado nesta organização.");
    }
    if (
      appointment.status === "cancelled" ||
      appointment.status === "no_show"
    ) {
      return skipped(
        "Agendamento cancelado ou com falta da cliente: nenhum protocolo foi enviado."
      );
    }
    if (!appointment.client_phone) {
      return skipped(
        "A cliente não tem telefone cadastrado, então não é possível enviar o protocolo."
      );
    }

    const procedureRows = (await sql`
      SELECT procedure_id
      FROM appointment_procedures
      WHERE appointment_id = ${appointmentId}
        AND organization_id = ${organizationId}
      UNION
      SELECT procedure_id
      FROM appointments
      WHERE id = ${appointmentId}
        AND organization_id = ${organizationId}
        AND procedure_id IS NOT NULL
    `) as { procedure_id: string | null }[];

    const procedureIds = [
      ...new Set(
        procedureRows
          .map((row) => row.procedure_id)
          .filter((value): value is string => Boolean(value))
      ),
    ];

    if (procedureIds.length === 0) {
      return skipped(
        "O agendamento não tem procedimento associado; não há protocolo para enviar."
      );
    }

    const kind = trigger === "pre_appointment" ? "pre" : "post";

    const protocols = (await sql`
      SELECT id, procedure_id, name, description, mime_type
      FROM procedure_protocols
      WHERE organization_id = ${organizationId}
        AND procedure_id = ANY(${procedureIds}::uuid[])
        AND is_current = TRUE
        AND protocol_kind = ${kind}
        ${protocolId ? sql`AND id = ${protocolId}` : sql`AND auto_send = TRUE`}
      ORDER BY updated_at DESC
    `) as {
      id: string;
      procedure_id: string;
      name: string;
      description: string | null;
      mime_type: string;
    }[];

    if (protocols.length === 0) {
      return skipped(
        protocolId
          ? "O protocolo informado não está vigente, não pertence a este agendamento ou o envio automático está desligado."
          : "Nenhum protocolo com envio automático está configurado para este momento do atendimento."
      );
    }

    // Credenciais da própria organização (já cifradas no banco). Sem canal
    // conectado, nenhum envio é simulado: o estado registrado fica "unavailable".
    const credentials =
      await readOrganizationWhatsAppCredentials(organizationId);

    let sent = 0;
    let attempted = 0;
    let unavailable = 0;
    let failed = 0;
    let firstDetail = "";

    for (const protocol of protocols) {
      const deliveryId = await reserveDelivery({
        organizationId,
        protocolId: protocol.id,
        appointmentId,
        clientId: appointment.client_id,
        trigger,
      });

      // Já confirmado como enviado para este agendamento: não envia de novo.
      if (!deliveryId) continue;

      attempted += 1;

      if (!credentials.ok) {
        unavailable += 1;
        if (!firstDetail) firstDetail = credentials.message;
        await finishDelivery({
          organizationId,
          deliveryId,
          status: "unavailable",
          detail: credentials.message,
        });
        continue;
      }

      const file = await loadProtocolFile(
        organizationId,
        protocol.procedure_id,
        protocol.id
      );

      if (!file) {
        failed += 1;
        const detail = "O arquivo do protocolo não está disponível.";
        if (!firstDetail) firstDetail = detail;
        await finishDelivery({
          organizationId,
          deliveryId,
          status: "failed",
          detail,
        });
        continue;
      }

      const filename = file.name.toLowerCase().endsWith(".pdf")
        ? file.name
        : `${file.name}.pdf`;

      const result = await sendWhatsAppDocument({
        to: appointment.client_phone,
        filename,
        bytes: file.data,
        mimeType: file.mimeType,
        caption: protocol.description?.trim() || protocol.name,
        credentials: {
          accessToken: credentials.accessToken,
          phoneNumberId: credentials.phoneNumberId,
        },
      });

      if (result.ok) {
        sent += 1;
        await finishDelivery({
          organizationId,
          deliveryId,
          status: "sent",
          detail: "A Meta confirmou o envio do documento.",
          providerMessageId: result.providerMessageId,
        });
        continue;
      }

      failed += 1;
      if (!firstDetail) firstDetail = result.message;
      await finishDelivery({
        organizationId,
        deliveryId,
        status: "failed",
        detail: result.message,
      });
    }

    if (attempted === 0) {
      return skipped(
        "Este protocolo já foi enviado para este agendamento; nenhum envio duplicado foi feito."
      );
    }

    if (sent > 0) {
      const pendentes = failed + unavailable;
      return {
        status: "sent",
        sent,
        attempted,
        detail:
          pendentes > 0
            ? `${sent} de ${attempted} protocolo(s) enviado(s). ${firstDetail}`
            : `${sent} protocolo(s) enviado(s) e confirmado(s) pela Meta.`,
      };
    }

    if (unavailable > 0 && failed === 0) {
      return {
        status: "unavailable",
        sent: 0,
        attempted,
        detail: firstDetail,
      };
    }

    return {
      status: "failed",
      sent: 0,
      attempted,
      detail: firstDetail || "O envio não foi confirmado pelo provedor.",
    };
  } catch (error) {
    console.error("Protocol delivery error:", error);
    return {
      status: "failed",
      sent: 0,
      attempted: 0,
      detail:
        "Não foi possível concluir o envio do protocolo agora. Tente novamente pela tela de Procedimentos.",
    };
  }
}
