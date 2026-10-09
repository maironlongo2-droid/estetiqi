import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { PERMANENTLY_DELETED_SOURCE } from "@/lib/clients/constants";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    const { id } = await params;
    const organizationId = currentUser.organization.id;

    if (!hasPermission(currentUser.role, "clients", "read")) {
      return Response.json(
        { error: "Você não tem permissão para visualizar clientes." },
        { status: 403 }
      );
    }

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
        AND source IS DISTINCT FROM ${PERMANENTLY_DELETED_SOURCE}
      LIMIT 1
    `;

    if (clientResult.length === 0) {
      return Response.json(
        { error: "Cliente não encontrado." },
        { status: 404 }
      );
    }

    const client = clientResult[0];

    const [appointments, payments, events, metricsResult] = await Promise.all([
      sql`
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
    `,

      sql`
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
    `,

      sql`
      SELECT
        id,
        event_type,
        source,
        appointment_id,
        payment_id,
        data,
        created_at
      FROM customer_events
      WHERE client_id = ${id}
        AND organization_id = ${organizationId}
      ORDER BY created_at DESC
      LIMIT 100
    `,

      sql`
        WITH appointment_metrics AS (
          SELECT
            COUNT(*) FILTER (
              WHERE status NOT IN ('cancelled', 'no_show')
            )::int AS appointments_count,
            COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
            MIN(starts_at) FILTER (WHERE status = 'completed') AS first_appointment_at,
            MAX(starts_at) FILTER (WHERE status = 'completed') AS last_appointment_at,
            CASE
              WHEN COUNT(*) FILTER (WHERE status = 'completed') > 0
              THEN GREATEST(
                0,
                FLOOR(
                  EXTRACT(
                    EPOCH FROM (
                      NOW() - MAX(starts_at) FILTER (WHERE status = 'completed')
                    )
                  ) / 86400
                )
              )::int
              ELSE NULL
            END AS days_since_last_appointment,
            MIN(starts_at) FILTER (
              WHERE status IN ('scheduled', 'confirmed')
                AND starts_at > NOW()
            ) AS next_appointment_at
          FROM appointments
          WHERE client_id = ${id}
            AND organization_id = ${organizationId}
        ),
        payment_metrics AS (
          SELECT
            COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS total_paid,
            AVG(amount) FILTER (WHERE status = 'paid') AS average_paid_ticket,
            COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_transactions_count
          FROM payments
          WHERE client_id = ${id}
            AND organization_id = ${organizationId}
        ),
        procedure_frequency AS (
          SELECT pr.name, COUNT(*)::int AS completed_count
          FROM appointments a
          JOIN procedures pr
            ON pr.id = a.procedure_id
            AND pr.organization_id = a.organization_id
          WHERE a.client_id = ${id}
            AND a.organization_id = ${organizationId}
            AND a.status = 'completed'
          GROUP BY pr.id, pr.name
          ORDER BY completed_count DESC, pr.name
          LIMIT 1
        ),
        last_procedure AS (
          SELECT
            pr.name,
            pr.return_interval_days,
            a.starts_at
          FROM appointments a
          LEFT JOIN procedures pr
            ON pr.id = a.procedure_id
            AND pr.organization_id = a.organization_id
          WHERE a.client_id = ${id}
            AND a.organization_id = ${organizationId}
            AND a.status = 'completed'
          ORDER BY a.starts_at DESC, a.id DESC
          LIMIT 1
        )
        SELECT
          appointment_metrics.*,
          payment_metrics.*,
          procedure_frequency.name AS most_frequent_procedure,
          last_procedure.name AS last_procedure,
          last_procedure.return_interval_days,
          CASE
            WHEN last_procedure.return_interval_days IS NOT NULL
            THEN last_procedure.starts_at +
              (last_procedure.return_interval_days * INTERVAL '1 day')
            ELSE NULL
          END AS return_due_at,
          CASE
            WHEN last_procedure.return_interval_days IS NOT NULL
            THEN CEIL(
              EXTRACT(
                EPOCH FROM (
                  last_procedure.starts_at +
                    (last_procedure.return_interval_days * INTERVAL '1 day') -
                  NOW()
                )
              ) / 86400
            )::int
            ELSE NULL
          END AS days_until_return
        FROM appointment_metrics
        CROSS JOIN payment_metrics
        LEFT JOIN procedure_frequency ON TRUE
        LEFT JOIN last_procedure ON TRUE
      `,
    ]);

    const metrics = metricsResult[0] ?? {
      appointments_count: 0,
      completed_count: 0,
      first_appointment_at: null,
      last_appointment_at: null,
      days_since_last_appointment: null,
      next_appointment_at: null,
      total_paid: 0,
      average_paid_ticket: null,
      paid_transactions_count: 0,
      most_frequent_procedure: null,
      last_procedure: null,
      return_interval_days: null,
      return_due_at: null,
      days_until_return: null,
    };

    return Response.json({
      client,
      appointments,
      payments,
      events,
      totals: metrics,
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
