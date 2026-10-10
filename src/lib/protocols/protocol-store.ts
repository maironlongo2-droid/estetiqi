// Acesso ao banco dos protocolos de procedimento (documentos PDF da clínica).
//
// MÓDULO EXCLUSIVO DO SERVIDOR. Todas as consultas filtram por
// `organization_id` — que SEMPRE vem do usuário autenticado, nunca do corpo da
// requisição — e por `procedure_id`, garantindo o isolamento entre organizações.
//
// HONESTIDADE (estrutura pendente): a migration 034 pode ainda não estar
// aplicada. Antes de ler/gravar verificamos a estrutura com
// `readProtocolSchemaReadiness` e, quando ausente, as rotas devolvem um estado
// explícito de "aguardando aplicação da migration" em vez de falhar ou fingir
// sucesso.

import { sql } from "@/lib/db/client";
import { isProtocolKind } from "@/lib/validation/protocol";

export type ProtocolSchemaReadiness = {
  protocols: boolean;
  deliveries: boolean;
  ready: boolean;
};

export async function readProtocolSchemaReadiness(): Promise<ProtocolSchemaReadiness> {
  const rows = (await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'procedure_protocols'
      ) AS has_protocols,
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'procedure_protocol_deliveries'
      ) AS has_deliveries
  `) as { has_protocols: boolean; has_deliveries: boolean }[];

  const protocols = Boolean(rows[0]?.has_protocols);
  const deliveries = Boolean(rows[0]?.has_deliveries);

  return { protocols, deliveries, ready: protocols && deliveries };
}

export type ProtocolDeliveryRecord = {
  id: string;
  appointmentId: string | null;
  clientId: string | null;
  clientName: string | null;
  appointmentStartsAt: string | null;
  triggerType: string;
  channel: string;
  status: string;
  detail: string | null;
  attempts: number;
  lastAttemptAt: string | null;
};

export type ProtocolRecord = {
  id: string;
  procedureId: string;
  name: string;
  description: string | null;
  protocolKind: string;
  autoSend: boolean;
  mimeType: string;
  sizeBytes: number;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
  deliveries: ProtocolDeliveryRecord[];
};

// Confere se o procedimento pertence à organização autenticada.
export async function procedureBelongsToOrganization(
  organizationId: string,
  procedureId: string
): Promise<boolean> {
  const rows = await sql`
    SELECT id
    FROM procedures
    WHERE id = ${procedureId}
      AND organization_id = ${organizationId}
    LIMIT 1
  `;
  return rows.length > 0;
}

// Metadados + conteúdo binário de um protocolo vigente, para abrir o PDF na tela
// autenticada. Sempre filtrado por organização e procedimento.
export async function loadProtocolFile(
  organizationId: string,
  procedureId: string,
  protocolId: string
): Promise<{ name: string; mimeType: string; data: Uint8Array } | null> {
  const rows = (await sql`
    SELECT
      name,
      mime_type,
      encode(file_data, 'base64') AS data
    FROM procedure_protocols
    WHERE id = ${protocolId}
      AND organization_id = ${organizationId}
      AND procedure_id = ${procedureId}
      AND is_current = TRUE
    LIMIT 1
  `) as { name: string; mime_type: string; data: string | null }[];

  const row = rows[0];
  if (!row?.data) return null;

  const raw = Buffer.from(String(row.data), "base64");
  const bytes = new Uint8Array(raw.byteLength);
  bytes.set(raw);

  return {
    name: row.name,
    mimeType: row.mime_type || "application/pdf",
    data: bytes,
  };
}

export function toIsoOrNull(
  value: string | Date | null | undefined
): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// Protocolos vigentes de um procedimento (mais recentes primeiro), com as últimas
// tentativas de envio de cada um. Nunca devolve o conteúdo binário do PDF: a
// leitura do arquivo passa por rota própria, autenticada.
export async function listProcedureProtocols(
  organizationId: string,
  procedureId: string,
  deliveriesPerProtocol = 5
): Promise<ProtocolRecord[]> {
  const protocols = (await sql`
    SELECT
      id,
      procedure_id,
      name,
      description,
      protocol_kind,
      auto_send,
      mime_type,
      size_bytes,
      version,
      created_at,
      updated_at
    FROM procedure_protocols
    WHERE organization_id = ${organizationId}
      AND procedure_id = ${procedureId}
      AND is_current = TRUE
    ORDER BY updated_at DESC
  `) as {
    id: string;
    procedure_id: string;
    name: string;
    description: string | null;
    protocol_kind: string;
    auto_send: boolean;
    mime_type: string;
    size_bytes: number | string;
    version: number;
    created_at: string | Date | null;
    updated_at: string | Date | null;
  }[];

  if (protocols.length === 0) return [];

  const ids = protocols.map((row) => row.id);

  const deliveries = (await sql`
    SELECT
      d.id,
      d.protocol_id,
      d.appointment_id,
      d.client_id,
      c.name AS client_name,
      a.starts_at AS appointment_starts_at,
      d.trigger_type,
      d.channel,
      d.status,
      d.detail,
      d.attempts,
      d.last_attempt_at
    FROM procedure_protocol_deliveries d
    LEFT JOIN clients c
      ON c.id = d.client_id
     AND c.organization_id = d.organization_id
    LEFT JOIN appointments a
      ON a.id = d.appointment_id
     AND a.organization_id = d.organization_id
    WHERE d.organization_id = ${organizationId}
      AND d.protocol_id = ANY(${ids}::uuid[])
    ORDER BY d.created_at DESC
  `) as {
    id: string;
    protocol_id: string;
    appointment_id: string | null;
    client_id: string | null;
    client_name: string | null;
    appointment_starts_at: string | Date | null;
    trigger_type: string;
    channel: string;
    status: string;
    detail: string | null;
    attempts: number;
    last_attempt_at: string | Date | null;
  }[];

  const byProtocol = new Map<string, ProtocolDeliveryRecord[]>();
  for (const row of deliveries) {
    const list = byProtocol.get(row.protocol_id) ?? [];
    if (list.length >= deliveriesPerProtocol) continue;
    list.push({
      id: row.id,
      appointmentId: row.appointment_id,
      clientId: row.client_id,
      clientName: row.client_name,
      appointmentStartsAt: toIsoOrNull(row.appointment_starts_at),
      triggerType: row.trigger_type,
      channel: row.channel,
      status: row.status,
      detail: row.detail,
      attempts: row.attempts,
      lastAttemptAt: toIsoOrNull(row.last_attempt_at),
    });
    byProtocol.set(row.protocol_id, list);
  }

  return protocols.map((row) => ({
    id: row.id,
    procedureId: row.procedure_id,
    name: row.name,
    description: row.description,
    protocolKind: isProtocolKind(row.protocol_kind) ? row.protocol_kind : "pre",
    autoSend: Boolean(row.auto_send),
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    version: row.version,
    createdAt: toIsoOrNull(row.created_at),
    updatedAt: toIsoOrNull(row.updated_at),
    deliveries: byProtocol.get(row.id) ?? [],
  }));
}
