import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { supportErrorResponse } from "@/lib/support/http";
import { supportIdSchema } from "@/lib/validation/support";

// Detalhe de uma solicitação do próprio usuário. A consulta sempre filtra por
// organização E usuário da sessão; qualquer outro caso responde 404, para não
// revelar a existência de tickets de outras organizações ou de outras pessoas.
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "support", "read")) {
      return Response.json(
        { error: "Você não tem permissão para ver solicitações de suporte." },
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

    const organizationId = currentUser.organization.id;
    const userId = currentUser.user.id;

    const requests = await sql`
      SELECT
        id,
        category,
        subject,
        description,
        status,
        created_at,
        updated_at
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

    const messages = await sql`
      SELECT
        id,
        author_type,
        body,
        created_at
      FROM support_messages
      WHERE request_id = ${parsedId.data}
        AND organization_id = ${organizationId}
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
