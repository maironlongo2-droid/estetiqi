import { sql } from "@/lib/db/client";
import { requireSupportAdmin } from "@/lib/support/admin";
import { supportErrorResponse } from "@/lib/support/http";
import {
  createSupportMessageSchema,
  supportIdSchema,
} from "@/lib/validation/support";

// Resposta da equipe de suporte a um ticket. A organização alvo vem sempre da
// própria solicitação (não do cliente). Se o ticket estava "aberto", ele passa
// automaticamente para "em andamento" ao receber a primeira resposta.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSupportAdmin();

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

    const tickets = await sql`
      SELECT id, organization_id, status
      FROM support_requests
      WHERE id = ${parsedId.data}
      LIMIT 1
    `;

    if (tickets.length === 0) {
      return Response.json(
        { error: "Solicitação não encontrada." },
        { status: 404 }
      );
    }

    const ticket = tickets[0];

    // O administrador da plataforma pode não ter usuário interno; nesse caso o
    // autor é identificado apenas pelo e-mail.
    const internalUser = await sql`
      SELECT id
      FROM users
      WHERE clerk_user_id = ${admin.clerkUserId}
      LIMIT 1
    `;
    const authorUserId = internalUser[0]?.id ?? null;

    const nextStatus = ticket.status === "open" ? "in_progress" : ticket.status;

    // INSERT da resposta + UPDATE do status na mesma transação (padrão já usado
    // em outras rotas via sql.transaction), para não registrar a resposta sem
    // refletir a mudança de situação no ticket.
    const [inserted] = await sql.transaction([
      sql`
        INSERT INTO support_messages (
          request_id,
          organization_id,
          author_type,
          author_user_id,
          author_email,
          body
        )
        VALUES (
          ${parsedId.data},
          ${ticket.organization_id},
          'support',
          ${authorUserId},
          ${admin.email},
          ${parsed.data.body}
        )
        RETURNING id, author_type, author_email, body, created_at
      `,
      sql`
        UPDATE support_requests
        SET status = ${nextStatus},
            updated_at = NOW()
        WHERE id = ${parsedId.data}
      `,
    ]);

    return Response.json(
      { message: inserted[0], status: nextStatus },
      { status: 201 }
    );
  } catch (error) {
    return supportErrorResponse(error, "Não foi possível enviar a resposta.");
  }
}
