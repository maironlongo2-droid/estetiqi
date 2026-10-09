import { sql } from "@/lib/db/client";

// Consultas administrativas da PLATAFORMA (cross-tenant). Usadas somente pelas
// rotas /api/admin/*, que exigem requireSupportAdmin no servidor. Reaproveitam
// as tabelas existentes (organizations, clients, appointments, payments) sem
// materialized views nem novas tabelas de agregacao.
//
// Diferencas importantes de nomenclatura financeira:
// - movimentacao registrada = soma dos pagamentos que NAO foram cancelados
//   (status 'paid' ou 'pending'). Nao e receita garantida.
// - pagamentos confirmados = soma dos pagamentos com status 'paid'.
// - valores cancelados (status 'cancelled') nunca entram em nenhum total.
// Nao ha soma duplicada: cada pagamento e uma unica linha em `payments`.

export type OrganizationAdminStatus = "active" | "blocked";

export type OrganizationOverview = {
  id: string;
  name: string;
  slug: string;
  status: OrganizationAdminStatus;
  createdAt: string;
  subscribedAt: string | null;
  subscriptionCanceledAt: string | null;
  acquisitionSource: string | null;
  blockedAt: string | null;
  blockedReason: string | null;
  blockedBy: string | null;
  onboardingCompleted: boolean;
  clients: number;
  clientsInPeriod: number;
  appointmentsTotal: number;
  appointmentsInPeriod: number;
  paymentsInPeriod: number;
  // Movimentacao financeira registrada no periodo (nao cancelada).
  registeredVolumeInPeriod: number;
  // Pagamentos confirmados (status 'paid'). Todo o historico e o periodo.
  confirmedVolumeTotal: number;
  confirmedVolumeInPeriod: number;
  lastActivityAt: string | null;
  activeDaysInPeriod: number;
};

const MAX_LIMIT = 500;

export async function listOrganizationOverview(params: {
  periodDays: number;
  search?: string;
  limit?: number;
}): Promise<OrganizationOverview[]> {
  const periodDays = params.periodDays;
  const search = (params.search ?? "").trim();
  const searchPattern = `%${search}%`;
  const limit = Math.min(Math.max(params.limit ?? 200, 1), MAX_LIMIT);

  const rows = await sql`
    WITH period AS (
      SELECT make_interval(days => ${periodDays}::int) AS span
    )
    SELECT
      o.id,
      o.name,
      o.slug,
      o.status,
      o.created_at,
      o.subscribed_at,
      o.subscription_canceled_at,
      o.acquisition_source,
      o.blocked_at,
      o.blocked_reason,
      o.blocked_by,
      o.onboarding_completed,
      COALESCE(cl.total, 0) AS clients,
      COALESCE(cl.in_period, 0) AS clients_in_period,
      COALESCE(ap.total, 0) AS appointments_total,
      COALESCE(ap.in_period, 0) AS appointments_in_period,
      COALESCE(pay.payments_in_period, 0) AS payments_in_period,
      COALESCE(pay.registered_in_period, 0) AS registered_volume_in_period,
      COALESCE(pay.confirmed_total, 0) AS confirmed_volume_total,
      COALESCE(pay.confirmed_in_period, 0) AS confirmed_volume_in_period,
      act.last_activity_at,
      COALESCE(act.active_days, 0) AS active_days_in_period
    FROM organizations o
    CROSS JOIN period per
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE c.created_at >= NOW() - per.span)::int AS in_period
      FROM clients c
      WHERE c.organization_id = o.id
    ) cl ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE a.created_at >= NOW() - per.span)::int AS in_period
      FROM appointments a
      WHERE a.organization_id = o.id
    ) ap ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE p.created_at >= NOW() - per.span
        )::int AS payments_in_period,
        COALESCE(SUM(p.amount) FILTER (
          WHERE p.status IN ('paid', 'pending')
            AND p.created_at >= NOW() - per.span
        ), 0)::numeric AS registered_in_period,
        COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'paid'), 0)::numeric
          AS confirmed_total,
        COALESCE(SUM(p.amount) FILTER (
          WHERE p.status = 'paid'
            AND p.created_at >= NOW() - per.span
        ), 0)::numeric AS confirmed_in_period
      FROM payments p
      WHERE p.organization_id = o.id
    ) pay ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        MAX(ev.created_at) AS last_activity_at,
        COUNT(DISTINCT DATE(ev.created_at)) FILTER (
          WHERE ev.created_at >= NOW() - per.span
        )::int AS active_days
      FROM (
        SELECT created_at FROM appointments WHERE organization_id = o.id
        UNION ALL SELECT created_at FROM payments WHERE organization_id = o.id
        UNION ALL SELECT created_at FROM clients WHERE organization_id = o.id
      ) ev
    ) act ON TRUE
    WHERE (
      ${search} = ''
      OR o.name ILIKE ${searchPattern}
      OR o.slug ILIKE ${searchPattern}
    )
    ORDER BY o.created_at DESC
    LIMIT ${limit}
  `;

  return rows.map(mapOrganization);
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapOrganization(row: Record<string, unknown>): OrganizationOverview {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    status: row.status === "blocked" ? "blocked" : "active",
    createdAt: toIso(row.created_at) ?? "",
    subscribedAt: toIso(row.subscribed_at),
    subscriptionCanceledAt: toIso(row.subscription_canceled_at),
    acquisitionSource:
      row.acquisition_source === null || row.acquisition_source === undefined
        ? null
        : String(row.acquisition_source),
    blockedAt: toIso(row.blocked_at),
    blockedReason:
      row.blocked_reason === null || row.blocked_reason === undefined
        ? null
        : String(row.blocked_reason),
    blockedBy:
      row.blocked_by === null || row.blocked_by === undefined
        ? null
        : String(row.blocked_by),
    onboardingCompleted: Boolean(row.onboarding_completed),
    clients: toNumber(row.clients),
    clientsInPeriod: toNumber(row.clients_in_period),
    appointmentsTotal: toNumber(row.appointments_total),
    appointmentsInPeriod: toNumber(row.appointments_in_period),
    paymentsInPeriod: toNumber(row.payments_in_period),
    registeredVolumeInPeriod: toNumber(row.registered_volume_in_period),
    confirmedVolumeTotal: toNumber(row.confirmed_volume_total),
    confirmedVolumeInPeriod: toNumber(row.confirmed_volume_in_period),
    lastActivityAt: toIso(row.last_activity_at),
    activeDaysInPeriod: toNumber(row.active_days_in_period),
  };
}
