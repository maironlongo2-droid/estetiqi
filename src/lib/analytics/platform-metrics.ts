import { sql } from "@/lib/db/client";

// Indicadores INTERNOS da plataforma EstetiQI (não confundir com o painel do
// negócio do usuário em src/lib/analytics/business-metrics.ts).
//
// Esta função agrega TODAS as organizações e é usada exclusivamente pela página
// administrativa /admin/painel, que exige requireSupportAdmin no servidor.
// Retorna apenas números agregados: nunca nomes, e-mails, telefones, CPFs ou
// mensagens de clientes.
//
// Tudo é calculado em UMA única consulta (o driver Neon HTTP faz uma requisição
// por consulta), reaproveitando os índices existentes e sem materialized views.
//
// `periodDays` define a janela das métricas "no período" (novas organizações,
// novos clientes, agendamentos, pagamentos e volume pago). As métricas de
// atividade ficam fixas em 7 e 30 dias, conforme o escopo do MVP.

export type OpportunitiesByTypeStatus = {
  type: string;
  status: string;
  count: number;
};

export type PlatformMetrics = {
  periodDays: number;
  growth: {
    totalOrganizations: number;
    newOrganizations: number;
  };
  activation: {
    // Proxy de ativação: onboarding concluído + ao menos 1 cliente + ao menos
    // 1 agendamento. NÃO é prova de uso recorrente.
    activatedOrganizations: number;
    rate: number;
  };
  activity: {
    // Atividade OBSERVÁVEL nos registros existentes (agenda, clientes,
    // pagamentos, eventos e ações de IA). NÃO é contagem de logins.
    activeLast7Days: number;
    activeLast30Days: number;
  };
  operation: {
    totalClients: number;
    clientsInPeriod: number;
    totalAppointments: number;
    appointmentsInPeriod: number;
    totalPayments: number;
    paymentsInPeriod: number;
  };
  ai: {
    totalOpportunities: number;
    openOpportunities: number;
    opportunitiesByTypeStatus: OpportunitiesByTypeStatus[];
    totalActions: number;
    actionsInPeriod: number;
    whatsappOpens: number;
    whatsappOpensInPeriod: number;
  };
  support: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    pending: number;
    // Tempo aproximado até a primeira resposta (segundos), calculado a partir
    // das mensagens existentes. null quando ainda não há resposta registrada.
    averageFirstResponseSeconds: number | null;
  };
  finance: {
    // Volume REGISTRADO no sistema (não é a receita da EstetiQI).
    paidVolumeTotal: number;
    paidVolumeInPeriod: number;
  };
};

export async function getPlatformMetrics(
  periodDays: number
): Promise<PlatformMetrics> {
  const rows = await sql`
    WITH period AS (
      SELECT make_interval(days => ${periodDays}::int) AS span
    ),
    org_counts AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE o.created_at >= NOW() - p.span
        )::int AS new_in_period
      FROM organizations o
      CROSS JOIN period p
    ),
    activated AS (
      SELECT COUNT(*)::int AS activated
      FROM organizations o
      WHERE o.onboarding_completed = TRUE
        AND EXISTS (SELECT 1 FROM clients c WHERE c.organization_id = o.id)
        AND EXISTS (
          SELECT 1 FROM appointments a WHERE a.organization_id = o.id
        )
    ),
    activity_events AS (
      SELECT organization_id, created_at FROM appointments
      UNION ALL SELECT organization_id, created_at FROM payments
      UNION ALL SELECT organization_id, created_at FROM customer_events
      UNION ALL SELECT organization_id, created_at FROM ai_actions
      UNION ALL SELECT organization_id, created_at FROM clients
    ),
    activity_counts AS (
      SELECT
        COUNT(DISTINCT organization_id) FILTER (
          WHERE created_at >= NOW() - INTERVAL '7 days'
        )::int AS active_7d,
        COUNT(DISTINCT organization_id) FILTER (
          WHERE created_at >= NOW() - INTERVAL '30 days'
        )::int AS active_30d
      FROM activity_events
    ),

    client_counts AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE c.created_at >= NOW() - p.span
        )::int AS in_period
      FROM clients c
      CROSS JOIN period p
    ),
    appointment_counts AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE a.created_at >= NOW() - p.span
        )::int AS in_period
      FROM appointments a
      CROSS JOIN period p
    ),
    payment_counts AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE p.created_at >= NOW() - period.span
        )::int AS in_period,
        COALESCE(
          SUM(p.amount) FILTER (WHERE p.status = 'paid'),
          0
        )::numeric AS paid_total,
        COALESCE(
          SUM(p.amount) FILTER (
            WHERE p.status = 'paid'
              AND COALESCE(p.paid_at, p.created_at) >= NOW() - period.span
          ),
          0
        )::numeric AS paid_in_period
      FROM payments p
      CROSS JOIN period
    ),
    opportunity_counts AS (
      SELECT
        (SELECT COUNT(*)::int FROM ai_opportunities) AS total,
        (
          SELECT COUNT(*)::int FROM ai_opportunities WHERE status = 'open'
        ) AS open_count,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'type', grouped.type,
                'status', grouped.status,
                'count', grouped.cnt
              )
              ORDER BY grouped.cnt DESC, grouped.type ASC
            )
            FROM (
              SELECT type, status, COUNT(*)::int AS cnt
              FROM ai_opportunities
              GROUP BY type, status
            ) grouped
          ),
          '[]'::json
        ) AS by_type_status
    ),
    action_counts AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE created_at >= NOW() - (SELECT span FROM period)
        )::int AS in_period,
        COUNT(*) FILTER (WHERE type = 'whatsapp_opened')::int AS whatsapp_total,
        COUNT(*) FILTER (
          WHERE type = 'whatsapp_opened'
            AND created_at >= NOW() - (SELECT span FROM period)
        )::int AS whatsapp_in_period
      FROM ai_actions
    ),
    support_counts AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
        COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
        COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
        COUNT(*) FILTER (
          WHERE status IN ('open', 'in_progress')
        )::int AS pending_count
      FROM support_requests
    ),
    support_response AS (
      SELECT AVG(
        EXTRACT(EPOCH FROM (first_reply.first_at - s.created_at))
      )::numeric AS avg_seconds
      FROM support_requests s
      JOIN LATERAL (
        SELECT MIN(m.created_at) AS first_at
        FROM support_messages m
        WHERE m.request_id = s.id AND m.author_type = 'support'
      ) first_reply ON first_reply.first_at IS NOT NULL
    )
    SELECT
      org_counts.total AS total_organizations,
      org_counts.new_in_period AS new_organizations,
      activated.activated AS activated_organizations,
      activity_counts.active_7d,
      activity_counts.active_30d,
      client_counts.total AS total_clients,
      client_counts.in_period AS clients_in_period,
      appointment_counts.total AS total_appointments,
      appointment_counts.in_period AS appointments_in_period,
      payment_counts.total AS total_payments,
      payment_counts.in_period AS payments_in_period,
      payment_counts.paid_total AS paid_volume_total,
      payment_counts.paid_in_period AS paid_volume_in_period,
      opportunity_counts.total AS total_opportunities,
      opportunity_counts.open_count AS open_opportunities,
      opportunity_counts.by_type_status AS opportunities_by_type_status,
      action_counts.total AS total_actions,
      action_counts.in_period AS actions_in_period,
      action_counts.whatsapp_total AS whatsapp_opens_total,
      action_counts.whatsapp_in_period AS whatsapp_opens_in_period,
      support_counts.total AS total_support,
      support_counts.open_count AS support_open,
      support_counts.in_progress_count AS support_in_progress,
      support_counts.resolved_count AS support_resolved,
      support_counts.closed_count AS support_closed,
      support_counts.pending_count AS support_pending,
      support_response.avg_seconds AS support_avg_first_response_seconds
    FROM org_counts,
         activated,
         activity_counts,
         client_counts,
         appointment_counts,
         payment_counts,
         opportunity_counts,
         action_counts,
         support_counts,
         support_response
  `;

  return mapPlatformMetrics(periodDays, rows[0] as Record<string, unknown>);
}

// Converte a linha (nomes de coluna em snake_case e valores possivelmente
// numéricos como string, por causa do NUMERIC/COUNT do Postgres) no objeto
// tipado usado pela interface. Nunca lança por campo ausente.
function mapPlatformMetrics(
  periodDays: number,
  row: Record<string, unknown>
): PlatformMetrics {
  const totalOrganizations = Number(row.total_organizations ?? 0);
  const activatedOrganizations = Number(row.activated_organizations ?? 0);
  const firstResponse = row.support_avg_first_response_seconds;

  return {
    periodDays,
    growth: {
      totalOrganizations,
      newOrganizations: Number(row.new_organizations ?? 0),
    },
    activation: {
      activatedOrganizations,
      rate:
        totalOrganizations > 0
          ? (activatedOrganizations / totalOrganizations) * 100
          : 0,
    },
    activity: {
      activeLast7Days: Number(row.active_7d ?? 0),
      activeLast30Days: Number(row.active_30d ?? 0),
    },
    operation: {
      totalClients: Number(row.total_clients ?? 0),
      clientsInPeriod: Number(row.clients_in_period ?? 0),
      totalAppointments: Number(row.total_appointments ?? 0),
      appointmentsInPeriod: Number(row.appointments_in_period ?? 0),
      totalPayments: Number(row.total_payments ?? 0),
      paymentsInPeriod: Number(row.payments_in_period ?? 0),
    },
    ai: {
      totalOpportunities: Number(row.total_opportunities ?? 0),
      openOpportunities: Number(row.open_opportunities ?? 0),
      opportunitiesByTypeStatus: Array.isArray(
        row.opportunities_by_type_status
      )
        ? (row.opportunities_by_type_status as OpportunitiesByTypeStatus[]).map(
            (item) => ({
              type: String(item.type),
              status: String(item.status),
              count: Number(item.count),
            })
          )
        : [],
      totalActions: Number(row.total_actions ?? 0),
      actionsInPeriod: Number(row.actions_in_period ?? 0),
      whatsappOpens: Number(row.whatsapp_opens_total ?? 0),
      whatsappOpensInPeriod: Number(row.whatsapp_opens_in_period ?? 0),
    },
    support: {
      total: Number(row.total_support ?? 0),
      open: Number(row.support_open ?? 0),
      inProgress: Number(row.support_in_progress ?? 0),
      resolved: Number(row.support_resolved ?? 0),
      closed: Number(row.support_closed ?? 0),
      pending: Number(row.support_pending ?? 0),
      averageFirstResponseSeconds:
        firstResponse === null || firstResponse === undefined
          ? null
          : Number(firstResponse),
    },
    finance: {
      paidVolumeTotal: Number(row.paid_volume_total ?? 0),
      paidVolumeInPeriod: Number(row.paid_volume_in_period ?? 0),
    },
  };
}
