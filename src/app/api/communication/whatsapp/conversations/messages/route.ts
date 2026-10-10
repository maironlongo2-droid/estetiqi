import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { readWhatsAppSchemaReadiness } from "@/lib/communication/whatsapp-integration-store";

// Histórico de UMA conversa (por número de telefone) da organização autenticada.
// Reúne mensagens recebidas (inbound.sender_phone) e enviadas (outbound, casadas
// pelo telefone do cliente vinculado). A organização vem do usuário autenticado.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MessageRow = {
  id: string;
  direction: string;
  status: string | null;
  body: string | null;
  message_type: string | null;
  error_message: string | null;
  created_at: string | Date;
};

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "clients", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const digits = (searchParams.get("phone") ?? "").replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 20) {
      return Response.json({ error: "Telefone inválido." }, { status: 400 });
    }

    const readiness = await readWhatsAppSchemaReadiness();
    if (!readiness.communicationMessages || !readiness.inboundColumns) {
      return Response.json({ ready: false, messages: [] });
    }

    const rows = (await sql`
      SELECT
        m.id,
        m.direction,
        m.status,
        m.body,
        m.message_type,
        m.error_message,
        m.created_at
      FROM communication_messages m
      WHERE m.organization_id = ${currentUser.organization.id}
        AND (
          (
            m.direction = 'inbound'
            AND m.sender_phone IS NOT NULL
            AND regexp_replace(m.sender_phone, '[^0-9]', '', 'g') = ${digits}
          )
          OR
          (
            m.direction = 'outbound'
            AND m.client_id IS NOT NULL
            AND m.client_id IN (
              SELECT c.id FROM clients c
              WHERE c.organization_id = ${currentUser.organization.id}
                AND c.phone IS NOT NULL
                AND regexp_replace(c.phone, '[^0-9]', '', 'g') = ${digits}
            )
          )
          OR
          (
            -- Enviadas pela API oficial para um número ainda não vinculado a
            -- cliente: o destino foi gravado em metadata.to pelo envio. A coluna
            -- metadata existe junto de sender_phone (migration 036), já checada
            -- pelo readiness acima.
            m.direction = 'outbound'
            AND m.metadata->>'to' IS NOT NULL
            AND regexp_replace(m.metadata->>'to', '[^0-9]', '', 'g') = ${digits}
          )
        )
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 200
    `) as MessageRow[];

    const messages = rows.map((row) => ({
      id: row.id,
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      status: row.status,
      body: row.body,
      messageType: row.message_type,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at).toISOString(),
    }));

    return Response.json({ ready: true, messages });
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

    console.error("List WhatsApp conversation messages error:", error);

    return Response.json(
      { error: "Não foi possível carregar a conversa." },
      { status: 500 }
    );
  }
}
