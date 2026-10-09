import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { supportErrorResponse } from "@/lib/support/http";
import {
  createSupportMessageSchema,
  supportIdSchema,
} from "@/lib/validation/support";

// Proteção simples contra abuso, alinhada ao POST de criação: no máximo N
// mensagens por janela de tempo, por usuário (dados reais do banco).
const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_MESSAGES = 30;

// Resposta da cliente dentro do próprio ticket. Só aceita se o ticket pertencer
// ao usuário e à organização da sessão e ainda estiver aberto/em andamento.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "support", "create")) {
      return Response.json(
        { error: "Você não tem permissão para responder solicitações." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const parsedId = supportIdSchema.safeParse(id);

    if (!parsedId.success) {
      return Response.json(
        { error: "Solicitação não encontrada." },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createSupportMessageSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Dados inválidos.",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const organizationId = currentUser.organization.id;
    const userId = currentUser.user.id;

    const requests = await sql`
      SELECT id, status
      FROM support_requests
      WHERE id = ${parsedId.data}
        AND organization_id = ${organizationId}
        AND user_id = ${userId}
      LIMIT 1
    `;

    if (requests.length === 0) {
      return Response.json(
        { error: "Solicitação não encontrada." },
        { status: 404 }
      );
    }

    const status = requests[0].status;

    if (status === "resolved" || status === "closed") {
      return Response.json(
        {
          error:
            "Esta solicitação está encerrada e não aceita novas mensagens.",
        },
        { status: 409 }
      );
    }

    const recent = await sql`
      SELECT COUNT(*)::int AS total
      FROM support_messages
      WHERE organization_id = ${organizationId}
        AND author_user_id = ${userId}
        AND created_at > NOW() - (${RATE_WINDOW_MINUTES}::int * INTERVAL '1 minute')
    `;

    if ((recent[0]?.total ?? 0) >= RATE_MAX_MESSAGES) {
      return Response.json(
        {
          error:
            "Você enviou muitas mensagens em pouco tempo. Aguarde alguns minutos e tente novamente.",
        },
        { status: 429 }
      );
    }

    // Organização e usuário vêm da sessão autenticada, nunca do cliente.
    // INSERT da mensagem + UPDATE do chamado na mesma transação (padrão já usado
    // em outras rotas via sql.transaction), para nunca gravar a mensagem sem
    // atualizar o updated_at do ticket.
    const [inserted] = await sql.transaction([
      sql`
        INSERT INTO support_messages (
          request_id,
          organization_id,
          author_type,
          author_user_id,
          body
        )
        VALUES (
          ${parsedId.data},
          ${organizationId},
          'customer',
          ${userId},
          ${parsed.data.body}
        )
        RETURNING id, author_type, body, created_at
      `,
      sql`
        UPDATE support_requests
        SET updated_at = NOW()
        WHERE id = ${parsedId.data}
          AND organization_id = ${organizationId}
      `,
    ]);

    return Response.json({ message: inserted[0] }, { status: 201 });
  } catch (error) {
    return supportErrorResponse(error, "Não foi possível enviar a mensagem.");
  }
}
