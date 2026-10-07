import { sql } from "@/lib/db/client";
import { PERMANENTLY_DELETED_SOURCE } from "@/lib/clients/constants";

export async function getBusinessContext(organizationId: string) {
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
    organization AS (
      SELECT
        id,
        name,
        business_phone,
        city,
        state,
        business_type,
        timezone
      FROM organizations
      WHERE id = ${organizationId}
      LIMIT 1
    ),
    professionals AS (
      SELECT
        COALESCE(a.professional_name, 'Não informado') AS name,
        COUNT(*) FILTER (WHERE a.status = 'completed') AS completed_appointments,
        COUNT(*) AS appointments,
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
    ),
    services AS (
      SELECT
        pr.id,
        pr.name,
        pr.price,
        pr.duration_minutes,
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
      GROUP BY pr.id, pr.name, pr.price, pr.duration_minutes
    ),
    customers AS (
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status = 'inactive') AS inactive
      FROM clients
      WHERE organization_id = ${organizationId}
          AND source IS DISTINCT FROM ${PERMANENTLY_DELETED_SOURCE}
    ),
    appointments AS (
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
        COUNT(*) FILTER (WHERE status = 'no_show') AS no_show
      FROM appointments a
      CROSS JOIN organization_period o
      WHERE a.organization_id = ${organizationId}
        AND a.starts_at >= o.month_start AT TIME ZONE o.timezone
        AND a.starts_at < o.next_month_start AT TIME ZONE o.timezone
    ),
    current_finance AS (
      SELECT
        COALESCE(
          SUM(p.amount) FILTER (WHERE p.status = 'paid'),
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
    previous_finance AS (
      SELECT
        COALESCE(
          SUM(p.amount) FILTER (WHERE p.status = 'paid'),
          0
        ) AS revenue,
        COUNT(*) FILTER (WHERE p.status = 'paid') AS payments
      FROM payments p
      CROSS JOIN organization_period o
      WHERE p.organization_id = ${organizationId}
        AND p.paid_at >= (
          o.month_start - INTERVAL '1 month'
        ) AT TIME ZONE o.timezone
        AND p.paid_at < o.month_start AT TIME ZONE o.timezone
    )
    SELECT
      (SELECT row_to_json(organization) FROM organization) AS organization,

      (SELECT COALESCE(json_agg(professionals), '[]'::json)
       FROM professionals) AS professionals,

      (SELECT COALESCE(json_agg(services), '[]'::json)
       FROM services) AS services,

      (SELECT row_to_json(customers) FROM customers) AS customers,

      (SELECT row_to_json(appointments) FROM appointments) AS appointments,

      (SELECT row_to_json(current_finance) FROM current_finance)
        AS current_finance,

      (SELECT row_to_json(previous_finance) FROM previous_finance)
        AS previous_finance
  `;

  const context = result[0];

  if (!context?.organization) {
    throw new Error("ORGANIZATION_NOT_FOUND");
  }

  return context;
}
