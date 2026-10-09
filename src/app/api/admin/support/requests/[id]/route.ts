import { sql } from "@/lib/db/client";
import { requireSupportAdmin } from "@/lib/support/admin";
import { supportErrorResponse } from "@/lib/support/http";
import {
  supportIdSchema,
  updateSupportStatusSchema,
} from "@/lib/validation/support";

// Detalhe de uma solicitação (qualquer organização) + conversa completa.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireSupportAdmin();

    const { id } = await context.params;
    const parsedId = supportIdSchema.safeParse(id);

    if (!parsedId.success) {
      return Response.json(
        { error: "Solicitação não encontrada." },
        { status: 404 }
      );
    }

    const requests = await sql`
      SELECT
        s.id,
        s.category,
        s.subject,
        s.description,
        s.status,
        s.created_at,
        s.updated_at,
        o.name AS organization_name,
        u.name AS user_name,
        u.email AS user_email
      FROM support_requests s
      JOIN organizations o ON o.id = s.organization_id
      JOIN users u ON u.id = s.user_id
      WHERE s.id = ${parsedId.data}
      LIMIT 1
    `;

    if (requests.length === 0) {
      return Response.json(
        { error: "Solicitação não encontrada." },
        { status: 404 }
      );
    }

    const messages = await sql`
      SELECT
        id,
        author_type,
        author_email,
        body,
        created_at
      FROM support_messages
      WHERE request_id = ${parsedId.data}
      ORDER BY created_at ASC
    `;

    return Response.json({ request: requests[0], messages });
  } catch (error) {
    return supportErrorResponse(
      error,
      "Não foi possível carregar a solicitação."
    );
  }
}

// Altera o status do ticket entre aberto, em andamento e resolvido.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireSupportAdmin();

    const { id } = await context.params;
    const parsedId = supportIdSchema.safeParse(id);

    if (!parsedId.success) {
      return Response.json(
        { error: "Solicitação não encontrada." },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSupportStatusSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Situação inválida." },
        { status: 400 }
      );
    }

    const updated = await sql`
      UPDATE support_requests
      SET status = ${parsed.data.status},
          updated_at = NOW()
      WHERE id = ${parsedId.data}
      RETURNING id, status, updated_at
    `;

    if (updated.length === 0) {
      return Response.json(
        { error: "Solicitação não encontrada." },
        { status: 404 }
      );
    }

    return Response.json({ request: updated[0] });
  } catch (error) {
    return supportErrorResponse(
      error,
      "Não foi possível atualizar a solicitação."
    );
  }
}
