import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    const { id } = await params;
    const organizationId = currentUser.organization.id;

    const clientResult = await sql`
      SELECT
        id,
        name,
        phone,
        email,
        cpf,
        birth_date,
        notes,
        status,
        source,
        created_at,
        updated_at
      FROM clients
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (clientResult.length === 0) {
      return Response.json(
        { error: "Cliente não encontrado." },
        { status: 404 }
      );
    }

    const client = clientResult[0];

    const appointments = await sql`
      SELECT
        a.id,
        a.starts_at,
        a.ends_at,
        a.status,
        a.price,
        a.notes,
        a.professional_name,
        p.name AS procedure_name
      FROM appointments a
      LEFT JOIN procedures p
        ON p.id = a.procedure_id
        AND p.organization_id = ${organizationId}
      WHERE a.client_id = ${id}
        AND a.organization_id = ${organizationId}
      ORDER BY a.starts_at DESC
      LIMIT 50
    `;

    const payments = await sql`
      SELECT
        p.id,
        p.amount,
        p.payment_method,
        p.status,
        p.paid_at,
        p.notes,
        p.created_at,
        pr.name AS procedure_name
      FROM payments p
      LEFT JOIN procedures pr
        ON pr.id = p.procedure_id
        AND pr.organization_id = ${organizationId}
      WHERE p.client_id = ${id}
        AND p.organization_id = ${organizationId}
      ORDER BY p.created_at DESC
      LIMIT 50
    `;

    const events = await sql`
      SELECT
        id,
        event_type,
        source,
        data,
        created_at
      FROM customer_events
      WHERE client_id = ${id}
        AND organization_id = ${organizationId}
      ORDER BY created_at DESC
      LIMIT 100
    `;

    const totals = await sql`
      SELECT
        COUNT(*) FILTER (
          WHERE status NOT IN ('cancelled', 'no_show')
        )::int AS appointments_count,

        COUNT(*) FILTER (
          WHERE status = 'completed'
        )::int AS completed_count,

        COALESCE(
          SUM(
            CASE
              WHEN status = 'paid' THEN amount
              ELSE 0
            END
          ),
          0
        ) AS total_paid
      FROM payments
      WHERE client_id = ${id}
        AND organization_id = ${organizationId}
    `;

    return Response.json({
      client,
      appointments,
      payments,
      events,
      totals: totals[0] ?? {
        appointments_count: 0,
        completed_count: 0,
        total_paid: 0,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "UNAUTHENTICATED"
    ) {
      return Response.json(
        { error: "Não autenticado." },
        { status: 401 }
      );
    }

    console.error("Client profile error:", error);

    return Response.json(
      { error: "Não foi possível carregar a ficha do cliente." },
      { status: 500 }
    );
  }
}
