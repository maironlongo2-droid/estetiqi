import { z } from "zod";
import { PERMANENTLY_DELETED_SOURCE } from "@/lib/clients/constants";
import { sql } from "@/lib/db/client";

const returnOpportunityRowSchema = z.object({
  client_id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  last_appointment_at: z
    .union([z.string(), z.date()])
    .transform((date) => (date instanceof Date ? date.toISOString() : date)),
  last_appointment_id: z.string(),
  last_procedure_name: z.string().nullable(),
  inactive_days: z.coerce.number().int().nonnegative(),
  expected_return_days: z.coerce.number().int().positive(),
  priority: z.enum(["low", "medium", "high"]),
  reason: z.string(),
  suggested_action: z.string(),
  situation_key: z.string(),
  opportunity_id: z.string().nullable(),
  opportunity_status: z.string().nullable(),
});

type ReturnOpportunityRow = z.infer<typeof returnOpportunityRowSchema>;

function serializeOpportunities(candidates: ReturnOpportunityRow[]) {
  return {
    count: candidates.length,
    clients: candidates.map((candidate) => ({
      id: candidate.client_id,
      name: candidate.name,
      phone: candidate.phone,
      email: candidate.email,
      last_appointment_at: candidate.last_appointment_at,
      last_appointment_id: candidate.last_appointment_id,
      last_procedure_name: candidate.last_procedure_name,
      inactive_days: candidate.inactive_days,
      expected_return_days: candidate.expected_return_days,
      priority: candidate.priority,
      reason: candidate.reason,
      suggested_action: candidate.suggested_action,
      opportunity_id: candidate.opportunity_id,
      opportunity_status: candidate.opportunity_status,
    })),
    opportunities: candidates
      .filter((candidate) => candidate.opportunity_id)
      .map((candidate) => ({
        id: candidate.opportunity_id,
        title: `${candidate.name} — retorno recomendado`,
        description: candidate.reason,
        priority: candidate.priority,
        status: candidate.opportunity_status,
        client_id: candidate.client_id,
        data: {
          suggestedAction: candidate.suggested_action,
        },
      })),
  };
}

export async function getReturnOpportunityCandidates(organizationId: string) {
  const rows = await sql`
    WITH completed_visits AS (
      SELECT
        a.client_id,
        a.id AS appointment_id,
        a.starts_at,
        a.procedure_id,
        p.name AS procedure_name,
        p.return_interval_days,
        LAG(a.starts_at) OVER (
          PARTITION BY a.client_id, a.procedure_id
          ORDER BY a.starts_at, a.id
        ) AS previous_visit_at,
        ROW_NUMBER() OVER (
          PARTITION BY a.client_id
          ORDER BY a.starts_at DESC, a.id DESC
        ) AS visit_rank
      FROM appointments a
      JOIN clients c
        ON c.id = a.client_id
        AND c.organization_id = a.organization_id
      LEFT JOIN procedures p
        ON p.id = a.procedure_id
        AND p.organization_id = a.organization_id
      WHERE a.organization_id = ${organizationId}
        AND a.status = 'completed'
        AND a.starts_at <= NOW()
        AND c.status = 'active'
        AND c.source IS DISTINCT FROM ${PERMANENTLY_DELETED_SOURCE}
    ),
    client_history AS (
      SELECT client_id, COUNT(*)::int AS completed_count
      FROM completed_visits
      GROUP BY client_id
    ),
    procedure_history AS (
      SELECT
        client_id,
        procedure_id,
        COUNT(*)::int AS completed_count,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (starts_at - previous_visit_at)) / 86400)
            FILTER (WHERE previous_visit_at IS NOT NULL)
        )::int AS average_interval_days
      FROM completed_visits
      WHERE procedure_id IS NOT NULL
      GROUP BY client_id, procedure_id
    ),
    last_visits AS (
      SELECT
        client_id,
        appointment_id,
        starts_at,
        procedure_id,
        procedure_name,
        return_interval_days
      FROM completed_visits
      WHERE visit_rank = 1
    ),
    candidates AS (
      SELECT
        c.id AS client_id,
        c.name,
        c.phone,
        c.email,
        lv.starts_at AS last_appointment_at,
        lv.appointment_id AS last_appointment_id,
        lv.procedure_name AS last_procedure_name,
        GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (NOW() - lv.starts_at)) / 86400)
        )::int AS inactive_days,
        COALESCE(
          lv.return_interval_days,
          CASE
            WHEN ph.completed_count >= 3 THEN ph.average_interval_days
            ELSE NULL
          END
        ) AS expected_return_days,
        EXISTS (
          SELECT 1
          FROM appointments recent
          WHERE recent.organization_id = ${organizationId}
            AND recent.client_id = c.id
            AND recent.status IN ('cancelled', 'no_show')
            AND recent.starts_at > lv.starts_at
            AND recent.starts_at >= NOW() - INTERVAL '90 days'
        ) AS has_recent_cancellation,
        (
          lv.appointment_id::text || ':' ||
          COALESCE(
            lv.return_interval_days,
            CASE
              WHEN ph.completed_count >= 3 THEN ph.average_interval_days
              ELSE NULL
            END
          )::text
        ) AS situation_key
      FROM clients c
      JOIN client_history ch ON ch.client_id = c.id
      JOIN last_visits lv ON lv.client_id = c.id
      LEFT JOIN procedure_history ph
        ON ph.client_id = lv.client_id
        AND ph.procedure_id = lv.procedure_id
      WHERE c.organization_id = ${organizationId}
        AND c.status = 'active'
        AND c.source IS DISTINCT FROM ${PERMANENTLY_DELETED_SOURCE}
        AND ch.completed_count >= 2
        AND COALESCE(
          lv.return_interval_days,
          CASE
            WHEN ph.completed_count >= 3 THEN ph.average_interval_days
            ELSE NULL
          END
        ) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM appointments upcoming
          WHERE upcoming.organization_id = ${organizationId}
            AND upcoming.client_id = c.id
            AND upcoming.status IN ('scheduled', 'confirmed')
            AND upcoming.starts_at > NOW()
        )
    ),
    eligible AS (
      SELECT
        candidate.*,
        CASE
          WHEN has_recent_cancellation
            AND inactive_days >= expected_return_days * 2 THEN 'medium'
          WHEN has_recent_cancellation
            AND inactive_days >= expected_return_days THEN 'low'
          WHEN inactive_days >= expected_return_days * 2 THEN 'high'
          WHEN inactive_days >= expected_return_days THEN 'medium'
          ELSE 'low'
        END AS priority,
        CASE
          WHEN has_recent_cancellation THEN
            'Houve um cancelamento ou ausência depois do último atendimento concluído; vale oferecer uma nova data.'
          WHEN inactive_days >= expected_return_days THEN
            'O intervalo de retorno previsto para ' ||
            COALESCE(last_procedure_name, 'o procedimento') ||
            ' já passou: são ' || inactive_days || ' dias desde o atendimento.'
          ELSE
            'O retorno habitual para ' ||
            COALESCE(last_procedure_name, 'o procedimento') ||
            ' está próximo, em aproximadamente ' ||
            (expected_return_days - inactive_days) || ' dias.'
        END AS reason,
        CASE
          WHEN has_recent_cancellation THEN
            'Enviar uma mensagem pessoal perguntando se deseja remarcar o atendimento.'
          ELSE
            'Enviar uma mensagem pessoal convidando para agendar o retorno.'
        END AS suggested_action
      FROM candidates candidate
      WHERE inactive_days >= GREATEST(1, expected_return_days - 14)
        AND NOT EXISTS (
          SELECT 1
          FROM ai_opportunities previous
          WHERE previous.organization_id = ${organizationId}
            AND previous.client_id = candidate.client_id
            AND previous.type = 'client_return'
            AND previous.data->>'situationKey' = candidate.situation_key
            AND previous.status <> 'open'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM ai_actions rejected
          JOIN ai_opportunities previous
            ON previous.id = rejected.opportunity_id
            AND previous.organization_id = rejected.organization_id
          WHERE rejected.organization_id = ${organizationId}
            AND rejected.status = 'cancelled'
            AND previous.client_id = candidate.client_id
            AND previous.type = 'client_return'
            AND previous.status = 'open'
            AND previous.data->>'situationKey' = candidate.situation_key
        )
    )
    SELECT
      eligible.client_id,
      eligible.name,
      eligible.phone,
      eligible.email,
      eligible.last_appointment_at,
      eligible.last_appointment_id,
      eligible.last_procedure_name,
      eligible.inactive_days,
      eligible.expected_return_days,
      eligible.priority,
      eligible.reason,
      eligible.suggested_action,
      eligible.situation_key,
      current.id AS opportunity_id,
      current.status AS opportunity_status
    FROM eligible
    LEFT JOIN ai_opportunities current
      ON current.organization_id = ${organizationId}
      AND current.client_id = eligible.client_id
      AND current.type = 'client_return'
      AND current.data->>'situationKey' = eligible.situation_key
      AND current.status = 'open'
    ORDER BY
      CASE eligible.priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      eligible.inactive_days DESC,
      eligible.last_appointment_at ASC,
      eligible.client_id
    LIMIT 50
  `;
  const candidates = rows.map((row) => returnOpportunityRowSchema.parse(row));
  return serializeOpportunities(candidates);
}

export async function createReturnOpportunities(organizationId: string) {
  const candidateResult = await getReturnOpportunityCandidates(organizationId);
  if (candidateResult.clients.length === 0) return candidateResult;

  const candidates = candidateResult.clients;
  const rows = await sql`
    WITH generation_lock AS MATERIALIZED (
      SELECT pg_advisory_xact_lock(
        hashtextextended(${organizationId} || ':client-return-opportunities', 0)
      )
    ),
    incoming AS MATERIALIZED (
      SELECT candidate.*
      FROM jsonb_to_recordset(${JSON.stringify(candidates)}::jsonb) AS candidate(
        id uuid,
        name text,
        phone text,
        email text,
        last_appointment_at timestamptz,
        last_appointment_id uuid,
        last_procedure_name text,
        inactive_days integer,
        expected_return_days integer,
        priority text,
        reason text,
        suggested_action text,
        opportunity_id uuid,
        opportunity_status text
      )
      CROSS JOIN generation_lock
    ),
    updated AS (
      UPDATE ai_opportunities existing
      SET
        title = LEFT(incoming.name || ' — retorno recomendado', 180),
        description = incoming.reason,
        priority = incoming.priority,
        data = jsonb_build_object(
          'suggestedAction', incoming.suggested_action,
          'situationKey',
            incoming.last_appointment_id::text || ':' ||
            incoming.expected_return_days::text,
          'lastAppointmentId', incoming.last_appointment_id,
          'returnIntervalDays', incoming.expected_return_days,
          'generatedBy', 'return-rules'
        ),
        updated_at = NOW()
      FROM incoming
      WHERE existing.organization_id = ${organizationId}
        AND existing.client_id = incoming.id
        AND existing.type = 'client_return'
        AND existing.data->>'situationKey' =
          incoming.last_appointment_id::text || ':' ||
          incoming.expected_return_days::text
        AND existing.status = 'open'
      RETURNING existing.id, existing.client_id, existing.status, existing.data
    ),
    inserted AS (
      INSERT INTO ai_opportunities (
        organization_id,
        client_id,
        type,
        title,
        description,
        priority,
        status,
        data
      )
      SELECT
        ${organizationId},
        incoming.id,
        'client_return',
        LEFT(incoming.name || ' — retorno recomendado', 180),
        incoming.reason,
        incoming.priority,
        'open',
        jsonb_build_object(
          'suggestedAction', incoming.suggested_action,
          'situationKey',
            incoming.last_appointment_id::text || ':' ||
            incoming.expected_return_days::text,
          'lastAppointmentId', incoming.last_appointment_id,
          'returnIntervalDays', incoming.expected_return_days,
          'generatedBy', 'return-rules'
        )
      FROM incoming
      WHERE NOT EXISTS (
        SELECT 1
        FROM ai_opportunities existing
        WHERE existing.organization_id = ${organizationId}
          AND existing.client_id = incoming.id
          AND existing.type = 'client_return'
          AND existing.data->>'situationKey' =
            incoming.last_appointment_id::text || ':' ||
            incoming.expected_return_days::text
      )
      RETURNING id, client_id, status, data
    ),
    available AS (
      SELECT id, client_id, status, data FROM updated
      UNION ALL
      SELECT id, client_id, status, data FROM inserted
      UNION ALL
      SELECT existing.id, existing.client_id, existing.status, existing.data
      FROM ai_opportunities existing
      JOIN incoming
        ON incoming.id = existing.client_id
        AND existing.data->>'situationKey' =
          incoming.last_appointment_id::text || ':' ||
          incoming.expected_return_days::text
      WHERE existing.organization_id = ${organizationId}
        AND existing.type = 'client_return'
        AND existing.status = 'open'
        AND NOT EXISTS (
          SELECT 1 FROM updated WHERE updated.id = existing.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM inserted WHERE inserted.id = existing.id
        )
    )
    SELECT
      incoming.id AS client_id,
      incoming.name,
      incoming.phone,
      incoming.email,
      incoming.last_appointment_at,
      incoming.last_appointment_id,
      incoming.last_procedure_name,
      incoming.inactive_days,
      incoming.expected_return_days,
      incoming.priority,
      incoming.reason,
      incoming.suggested_action,
      incoming.last_appointment_id::text || ':' ||
        incoming.expected_return_days::text AS situation_key,
      available.id AS opportunity_id,
      available.status AS opportunity_status
    FROM incoming
    LEFT JOIN available
      ON available.client_id = incoming.id
      AND available.data->>'situationKey' =
        incoming.last_appointment_id::text || ':' ||
        incoming.expected_return_days::text
    ORDER BY
      CASE incoming.priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      incoming.inactive_days DESC,
      incoming.last_appointment_at ASC,
      incoming.id
  `;
  const persisted = rows.map((row) => returnOpportunityRowSchema.parse(row));
  return serializeOpportunities(persisted);
}
