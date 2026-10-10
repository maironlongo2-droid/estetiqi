import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sendWhatsAppMessage } from "@/lib/communication/whatsapp-send";
import { readOrganizationWhatsAppCredentials } from "@/lib/communication/whatsapp-integration-store";
import { clientIpFromRequest, rateLimit } from "@/lib/security/rate-limit";

// Envia uma mensagem de TEXTO pela API oficial da Meta usando o número conectado
// da PRÓPRIA organização. As credenciais são lidas (e decifradas) no servidor a
// partir do usuário autenticado — nunca vêm do cliente.
//
// Honestidade: só afirmamos envio quando a Meta confirma (providerMessageId).
// O registro no histórico é best-effort e informado separadamente via `recorded`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sendSchema = z.object({
  to: z.string().trim().min(8).max(30),
  body: z.string().trim().min(1).max(4096),
  clientId: z.string().uuid().optional().nullable(),
  appointmentId: z.string().uuid().optional().nullable(),
  category: z
    .enum(["atendimento", "transacional", "pos_atendimento", "promocional"])
    .optional(),
});

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    // Enviar pela API oficial é contatar a cliente: exige o mesmo nível de quem
    // gerencia clientes (paridade com a preparação/wa.me da Central).
    if (!hasPermission(currentUser.role, "clients", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const limit = rateLimit(
      `whatsapp:send:${currentUser.organization.id}:${clientIpFromRequest(request)}`,
      { limit: 60, windowMs: 60_000 }
    );
    if (!limit.ok) {
      return Response.json(
        { error: "Muitos envios em pouco tempo. Aguarde um instante." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Dados inválidos para o envio." },
        { status: 400 }
      );
    }

    // O cliente informado precisa ser da PRÓPRIA organização. Nunca aceitamos um
    // id vindo do cliente sem checar o tenant: sem isso o insert seria recusado
    // pela FK composta e o envio apareceria como "não registrado", sem explicar
    // o motivo real.
    if (parsed.data.clientId) {
      const owned = (await sql`
        SELECT 1 FROM clients
        WHERE id = ${parsed.data.clientId}
          AND organization_id = ${currentUser.organization.id}
        LIMIT 1
      `) as unknown[];
      if (owned.length === 0) {
        return Response.json(
          { error: "Cliente não encontrado." },
          { status: 404 }
        );
      }
    }

    // Credenciais da organização (token decifrado apenas no servidor).
    const credentials = await readOrganizationWhatsAppCredentials(
      currentUser.organization.id
    );
    if (!credentials.ok) {
      const status =
        credentials.code === "SCHEMA_PENDING"
          ? 503
          : credentials.code === "NOT_CONNECTED"
            ? 409
            : 500;
      return Response.json(
        { error: credentials.message, code: credentials.code },
        { status }
      );
    }

    const result = await sendWhatsAppMessage({
      to: parsed.data.to,
      message: { kind: "text", body: parsed.data.body },
      credentials: {
        accessToken: credentials.accessToken,
        phoneNumberId: credentials.phoneNumberId,
      },
    });

    if (!result.ok) {
      const status = result.code === "INVALID_PHONE" ? 400 : 502;
      return Response.json(
        { error: result.message, code: result.code },
        { status }
      );
    }

    // Registro no histórico (best-effort). Uma falha aqui NÃO muda o fato de a
    // Meta ter aceitado a mensagem — por isso devolvemos `recorded` separado.
    let recorded = false;
    try {
      const inserted = (await sql`
        INSERT INTO communication_messages (
          organization_id, client_id, appointment_id, channel, direction,
          category, status, body, provider_message_id, source,
          created_by_user_id, message_type, metadata, sent_at, created_at
        ) VALUES (
          ${currentUser.organization.id},
          ${parsed.data.clientId ?? null},
          ${parsed.data.appointmentId ?? null},
          'whatsapp', 'outbound',
          ${parsed.data.category ?? "atendimento"}, 'sent',
          ${parsed.data.body}, ${result.providerMessageId}, 'whatsapp_api',
          ${currentUser.user.id}, 'text',
          -- O destino fica registrado para que a caixa de entrada mostre a
          -- mensagem enviada MESMO quando o número ainda não é cliente vinculado.
          ${JSON.stringify({ to: parsed.data.to, via: "whatsapp_api" })}::jsonb,
          NOW(), NOW()
        )
        RETURNING id
      `) as { id: string }[];
      recorded = inserted.length > 0;
    } catch (recordError) {
      console.error("Record outbound WhatsApp message error:", recordError);
    }

    return Response.json({
      ok: true,
      providerMessageId: result.providerMessageId,
      recorded,
    });
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

    console.error("Send WhatsApp message error:", error);

    return Response.json(
      { error: "Não foi possível enviar a mensagem." },
      { status: 500 }
    );
  }
}
