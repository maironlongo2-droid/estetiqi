import { sql } from "@/lib/db/client";

export async function getBusinessMetrics(organizationId: string) {
  const result = await sql`
    WITH organization_period AS (
      SELECT
        timezone,
        DATE_TRUNC(
          'month',
          NOW() AT TIME ZONE timezone
        ) AS month_start,
        DATE_TRUNC(
          'month',
          NOW() AT TIME ZONE timezone
        ) + INTERVAL '1 month' AS next_month_start
      FROM organizations
      WHERE id = ${organizationId}
      LIMIT 1
    ),
    current_period AS (
      SELECT
        COALESCE(
          SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END),
          0
        ) AS revenue,
        COUNT(*) FILTER (WHERE p.status = 'paid') AS payments,
        COUNT(DISTINCT p.client_id) FILTER (WHERE p.status = 'paid') AS paying_clients
      FROM payments p
      CROSS JOIN organization_period o
      WHERE p.organization_id = ${organizationId}
        AND p.paid_at >= o.month_start AT TIME ZONE o.timezone
        AND p.paid_at < o.next_month_start AT TIME ZONE o.timezone
    ),
    previous_period AS (
      SELECT
        COALESCE(
          SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END),
          0
        ) AS revenue,
        COUNT(*) FILTER (WHERE p.status = 'paid') AS payments
      FROM payments p
      CROSS JOIN organization_period o
      WHERE p.organization_id = ${organizationId}
        AND p.paid_at >= (o.month_start - INTERVAL '1 month') AT TIME ZONE o.timezone
        AND p.paid_at < o.month_start AT TIME ZONE o.timezone
    ),
    procedure_metrics AS (
      SELECT
        pr.id,
        pr.name,
        COUNT(p.id) FILTER (WHERE p.status = 'paid') AS payments,
        COALESCE(
          SUM(p.amount) FILTER (WHERE p.status = 'paid'),
          0
        ) AS revenue
      FROM procedures pr
      LEFT JOIN payments p
        ON p.procedure_id = pr.id
        AND p.organization_id = pr.organization_id
        AND p.paid_at >= (
          SELECT month_start AT TIME ZONE timezone
          FROM organization_period
        )
        AND p.paid_at < (
          SELECT next_month_start AT TIME ZONE timezone
          FROM organization_period
        )
      WHERE pr.organization_id = ${organizationId}
      GROUP BY pr.id, pr.name
      ORDER BY revenue DESC
    ),
    appointment_metrics AS (
      SELECT
        COUNT(*) FILTER (
          WHERE status NOT IN ('cancelled', 'no_show')
        ) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE status = 'no_show') AS no_show
      FROM appointments a
      CROSS JOIN organization_period o
      WHERE a.organization_id = ${organizationId}
        AND a.starts_at >= o.month_start AT TIME ZONE o.timezone
        AND a.starts_at < o.next_month_start AT TIME ZONE o.timezone
    ),
    professional_metrics AS (
      SELECT
        COALESCE(a.professional_name, 'Não informado') AS professional_name,
        COUNT(*) FILTER (WHERE a.status = 'completed') AS appointments,
        COALESCE(
          SUM(p.amount) FILTER (WHERE p.status = 'paid'),
          0
        ) AS revenue
      FROM appointments a
      CROSS JOIN organization_period o
      LEFT JOIN payments p
        ON p.appointment_id = a.id
        AND p.organization_id = a.organization_id
      WHERE a.organization_id = ${organizationId}
        AND a.starts_at >= o.month_start AT TIME ZONE o.timezone
        AND a.starts_at < o.next_month_start AT TIME ZONE o.timezone
      GROUP BY COALESCE(a.professional_name, 'Não informado')
      ORDER BY revenue DESC
    )
    SELECT
      (SELECT row_to_json(current_period) FROM current_period) AS current_period,
      (SELECT row_to_json(previous_period) FROM previous_period) AS previous_period,
      (
        SELECT COALESCE(
          json_agg(procedure_metrics),
          '[]'::json
        )
        FROM procedure_metrics
      ) AS procedures,
      (SELECT row_to_json(appointment_metrics) FROM appointment_metrics) AS appointments,
      (
        SELECT COALESCE(
          json_agg(
            json_build_object(
              'professionalName', professional_name,
              'appointments', appointments,
              'revenue', revenue,
              'ticketAverage',
                CASE
                  WHEN appointments > 0
                  THEN revenue / appointments
                  ELSE 0
                END
            )
            ORDER BY revenue DESC
          ),
          '[]'::json
        )
        FROM professional_metrics
      ) AS professionals
  `;

  const row = result[0];
  const current = row.current_period;
  const previous = row.previous_period;

  const revenue = Number(current.revenue);
  const previousRevenue = Number(previous.revenue);

  const revenueChange =
    previousRevenue > 0
      ? ((revenue - previousRevenue) / previousRevenue) * 100
      : null;

  const ticketAverage =
    Number(current.payments) > 0
      ? revenue / Number(current.payments)
      : 0;

  return {
    period: "current_month",
    revenue,
    previousRevenue,
    revenueChange,
    payments: Number(current.payments),
    payingClients: Number(current.paying_clients),
    ticketAverage,
    procedures: row.procedures,
    appointments: row.appointments,
    professionals: row.professionals,
  };
}
