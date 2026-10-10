import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { readWhatsAppSchemaReadiness } from "@/lib/communication/whatsapp-integration-store";

// Lista as conversas de WhatsApp da organização autenticada: uma linha por
// número de cliente que escreveu (mensagens inbound). A organização vem do
// usuário — nunca do cliente.
//
// Honestidade: se a estrutura do histórico/inbound ainda não estiver aplicada no
// banco, devolvemos `ready: false` e lista vazia (a interface avisa), em vez de
// inventar conversas.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ConversationRow = {
  phone: string;
  client_id: string | null;
  client_name: string | null;
  last_body: string | null;
  last_message_type: string | null;
  last_at: string | Date;
  message_count: string | number;
};

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "clients", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const readiness = await readWhatsAppSchemaReadiness();
    if (!readiness.communicationMessages || !readiness.inboundColumns) {
      return Response.json({ ready: false, conversations: [] });
    }

    const rows = (await sql`
      SELECT
        conv.phone,
        conv.client_id,
        c.name AS client_name,
        conv.last_body,
        conv.last_message_type,
        conv.last_at,
        conv.message_count
      FROM (
        SELECT DISTINCT ON (m.sender_phone)
          m.sender_phone AS phone,
          m.client_id,
          m.body AS last_body,
          m.message_type AS last_message_type,
          m.created_at AS last_at,
          COUNT(*) OVER (PARTITION BY m.sender_phone) AS message_count
        FROM communication_messages m
        WHERE m.organization_id = ${currentUser.organization.id}
          AND m.direction = 'inbound'
          AND m.sender_phone IS NOT NULL
        ORDER BY m.sender_phone, m.created_at DESC
      ) conv
      LEFT JOIN clients c
        ON c.organization_id = ${currentUser.organization.id}
       AND c.id = conv.client_id
      ORDER BY conv.last_at DESC
      LIMIT 100
    `) as ConversationRow[];

    const conversations = rows.map((row) => ({
      phone: row.phone,
      clientId: row.client_id,
      clientName: row.client_name,
      lastBody: row.last_body,
      lastMessageType: row.last_message_type,
      lastAt: new Date(row.last_at).toISOString(),
      messageCount: Number(row.message_count ?? 0),
    }));

    return Response.json({ ready: true, conversations });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json(
        { error: "A organização está bloqueada. Fale com o suporte da EstetiQI." },
        { status: 403 }
      );
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("List WhatsApp conversations error:", error);

    return Response.json(
      { error: "Não foi possível carregar as conversas." },
      { status: 500 }
    );
  }
}
