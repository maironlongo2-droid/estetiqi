import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { createSupportRequestSchema } from "@/lib/validation/support";
import { notifySupportRequest } from "@/lib/support/notify";

// Proteção simples contra abuso: no máximo N solicitações por janela de tempo,
// por usuário. Usa dados reais do banco (funciona entre instâncias serverless).
const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_REQUESTS = 10;

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "support", "read")) {
      return Response.json(
        { error: "Você não tem permissão para ver solicitações de suporte." },
        { status: 403 }
      );
    }

    // O usuário só enxerga as próprias solicitações, sempre dentro da própria
    // organização obtida da sessão autenticada.
    const requests = await sql`
      SELECT
        s.id,
        s.category,
        s.subject,
        s.status,
        s.created_at,
        s.updated_at,
        (
          SELECT COUNT(*)::int
          FROM support_messages m
          WHERE m.request_id = s.id AND m.author_type = 'support'
        ) AS support_messages,
        (
          SELECT COUNT(*)::int
          FROM support_messages m
          WHERE m.request_id = s.id
        ) AS messages
      FROM support_requests s
      WHERE s.organization_id = ${currentUser.organization.id}
        AND s.user_id = ${currentUser.user.id}
      ORDER BY s.updated_at DESC
      LIMIT 50
    `;

    return Response.json({ requests });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("List support requests error:", error);

    return Response.json(
      { error: "Não foi possível carregar as solicitações." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "support", "create")) {
      return Response.json(
        { error: "Você não tem permissão para enviar solicitações." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createSupportRequestSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Dados inválidos.",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Organização e usuário vêm da sessão autenticada, nunca do cliente.
    const organizationId = currentUser.organization.id;
    const userId = currentUser.user.id;

    const recent = await sql`
      SELECT COUNT(*)::int AS total
      FROM support_requests
      WHERE organization_id = ${organizationId}
        AND user_id = ${userId}
        AND created_at > NOW() - (${RATE_WINDOW_MINUTES}::int * INTERVAL '1 minute')
    `;

    if ((recent[0]?.total ?? 0) >= RATE_MAX_REQUESTS) {
      return Response.json(
        {
          error:
            "Você enviou muitas solicitações em pouco tempo. Aguarde alguns minutos e tente novamente.",
        },
        { status: 429 }
      );
    }

    const { category, subject, description } = parsed.data;

    const created = await sql`
      INSERT INTO support_requests (
        organization_id,
        user_id,
        category,
        subject,
        description
      )
      VALUES (
        ${organizationId},
        ${userId},
        ${category},
        ${subject},
        ${description}
      )
      RETURNING
        id,
        category,
        subject,
        status,
        created_at,
        updated_at
    `;

    const supportRequest = created[0];

    // A solicitação já está persistida. A notificação do responsável é opcional
    // e best-effort: se falhar (ou não estiver configurada), o registro continua
    // salvo e a interface não afirma que um e-mail foi enviado.
    const notified = await notifySupportRequest({
      id: supportRequest.id,
      organizationName: currentUser.organization.name,
      userEmail: currentUser.user.email,
      category,
      subject,
      description,
    }).catch(() => false);

    if (!notified) {
      console.log(
        `Support request ${supportRequest.id} salva. Notificação externa não enviada (SUPPORT_NOTIFICATION_WEBHOOK_URL).`
      );
    }

    return Response.json({ request: supportRequest }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Create support request error:", error);

    return Response.json(
      { error: "Não foi possível registrar a solicitação." },
      { status: 500 }
    );
  }
}
