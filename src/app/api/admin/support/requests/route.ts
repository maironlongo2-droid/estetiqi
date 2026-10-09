import { sql } from "@/lib/db/client";
import { requireSupportAdmin } from "@/lib/support/admin";
import { supportErrorResponse } from "@/lib/support/http";

// Lista as solicitações de TODAS as organizações clientes. Só o administrador
// da plataforma (allowlist de e-mails verificados em SUPPORT_ADMIN_EMAILS)
// passa por requireSupportAdmin; qualquer outro usuário recebe 403.
export async function GET() {
  try {
    await requireSupportAdmin();

    const requests = await sql`
      SELECT
        s.id,
        s.category,
        s.subject,
        s.status,
        s.created_at,
        s.updated_at,
        o.name AS organization_name,
        u.name AS user_name,
        u.email AS user_email,
        (
          SELECT COUNT(*)::int
          FROM support_messages m
          WHERE m.request_id = s.id AND m.author_type = 'support'
        ) AS support_messages,
        (
          SELECT COUNT(*)::int
          FROM support_messages m
          WHERE m.request_id = s.id AND m.author_type = 'customer'
        ) AS customer_messages
      FROM support_requests s
      JOIN organizations o ON o.id = s.organization_id
      JOIN users u ON u.id = s.user_id
      ORDER BY s.updated_at DESC
      LIMIT 200
    `;

    return Response.json({ requests });
  } catch (error) {
    return supportErrorResponse(
      error,
      "Não foi possível carregar as solicitações."
    );
  }
}
