import { sql } from "@/lib/db/client";
import { recordCustomerEvent } from "@/lib/events/customer-events";
import { checkProfessionalAvailability } from "@/lib/appointments/availability";
import {
  loadAppointmentProcedures,
  procedureLinksJson,
} from "@/lib/appointments/procedures";

// Motor único de criação de agendamento.
//
// Centraliza as regras que já existiam na rota autenticada
// `POST /api/appointments` para que o fluxo público as reutilize sem criar um
// mecanismo paralelo. Todas as validações são feitas no servidor: duração e
// preço são recalculados a partir dos procedimentos do banco, a elegibilidade
// do profissional é conferida e o conflito de horário é impedido de forma
// atômica (advisory lock + NOT EXISTS), inclusive em requisições simultâneas.

export type AppointmentRecord = {
  id: string;
  organization_id: string;
  client_id: string;
  procedure_id: string | null;
  professional_id: string | null;
  professional_name: string | null;
  starts_at: string;
  ends_at: string;
  price: number | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CreateAppointmentRecordInput = {
  organizationId: string;
  clientId: string;
  procedureIds: string[];
  professionalId: string | null;
  startsAt: string;
  endsAt: string;
  price?: number | null;
  notes?: string | null;
  status?: string;
  eventSource?: string;
};

export type CreateAppointmentRecordResult =
  | { ok: true; appointment: AppointmentRecord }
  | { ok: false; status: number; error: string };

export async function createAppointmentRecord(
  input: CreateAppointmentRecordInput
): Promise<CreateAppointmentRecordResult> {
  const {
    organizationId,
    clientId,
    procedureIds,
    professionalId,
    startsAt,
    endsAt,
    price = null,
    notes = null,
    status,
    eventSource = "system",
  } = input;

  // O cliente precisa existir, ser da organização e estar ativo.
  const clientResult = await sql`
    SELECT id, status
    FROM clients
    WHERE id = ${clientId}
      AND organization_id = ${organizationId}
      AND status = 'active'
    LIMIT 1
  `;

  if (clientResult.length === 0) {
    return {
      ok: false,
      status: 404,
      error: "Cliente não encontrado ou inativo.",
    };
  }

  const normalizedProcedureIds = procedureIds;
  const normalizedProcedureId = normalizedProcedureIds[0] ?? null;
  const normalizedProfessionalId = professionalId || null;
  let normalizedProfessionalName: string | null = null;

  const proceduresResult = await loadAppointmentProcedures(
    organizationId,
    normalizedProcedureIds,
    { requireActive: true }
  );
  if (!proceduresResult.ok) {
    return {
      ok: false,
      status: proceduresResult.status,
      error: proceduresResult.error,
    };
  }
  const { totalDurationMinutes, totalPrice } = proceduresResult;

  if (normalizedProfessionalId) {
    const professionalResult = await sql`
      SELECT id, name
      FROM professionals
      WHERE id = ${normalizedProfessionalId}
        AND organization_id = ${organizationId}
        AND active = TRUE
      LIMIT 1
    `;

    if (professionalResult.length === 0) {
      return {
        ok: false,
        status: 404,
        error: "Profissional não encontrado ou inativo.",
      };
    }

    normalizedProfessionalName = professionalResult[0].name;

    if (normalizedProcedureIds.length > 0) {
      const assignments = await sql`
        SELECT procedure_id
        FROM professional_procedures
        WHERE professional_id = ${normalizedProfessionalId}
          AND organization_id = ${organizationId}
          AND procedure_id = ANY(${normalizedProcedureIds}::uuid[])
      `;

      if (assignments.length !== normalizedProcedureIds.length) {
        return {
          ok: false,
          status: 409,
          error: "O profissional não está habilitado para este procedimento.",
        };
      }
    }
  }

  const start = new Date(startsAt);
  const requestedEnd = new Date(endsAt);
  // A duração total é sempre recalculada no servidor a partir dos
  // procedimentos válidos do banco (soma das durações).
  const end =
    totalDurationMinutes && !Number.isNaN(start.getTime())
      ? new Date(start.getTime() + totalDurationMinutes * 60_000)
      : requestedEnd;

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    return { ok: false, status: 400, error: "Intervalo de horário inválido." };
  }

  // O preço total também é recalculado no servidor. Só recorre ao valor
  // enviado pelo cliente quando nenhum procedimento possui preço cadastrado.
  const effectivePrice = totalPrice !== null ? totalPrice : price ?? null;

  if (
    normalizedProfessionalId &&
    status !== "cancelled" &&
    status !== "no_show"
  ) {
    const availability = await checkProfessionalAvailability({
      organizationId,
      professionalId: normalizedProfessionalId,
      startsAt: start,
      endsAt: end,
    });

    if (!availability.isAvailable) {
      return {
        ok: false,
        status: 409,
        error:
          availability.reason === "appointment_conflict"
            ? "O profissional já possui um agendamento nesse horário."
            : availability.reason === "blocked"
              ? "Este horário está bloqueado para o profissional."
              : "O horário não está dentro da disponibilidade do profissional.",
      };
    }
  }

  const bypassConflictCheck =
    !normalizedProfessionalId ||
    status === "cancelled" ||
    status === "no_show";
  const linksJson = procedureLinksJson(normalizedProcedureIds);
  const insertStatement = sql`
    WITH inserted AS (
      INSERT INTO appointments (
        organization_id,
        client_id,
        procedure_id,
        professional_id,
        professional_name,
        starts_at,
        ends_at,
        price,
        notes,
        status
      )
      SELECT
        ${organizationId},
        ${clientId},
        ${normalizedProcedureId},
        ${normalizedProfessionalId},
        ${normalizedProfessionalName},
        ${start.toISOString()},
        ${end.toISOString()},
        ${effectivePrice},
        ${notes},
        ${status ?? "scheduled"}
      WHERE ${bypassConflictCheck}
        OR NOT EXISTS (
          SELECT 1
          FROM appointments existing
          WHERE existing.organization_id = ${organizationId}
            AND (
              existing.professional_id = ${normalizedProfessionalId}
              OR (
                existing.professional_id IS NULL
                AND existing.professional_name = ${normalizedProfessionalName}
              )
            )
            AND existing.status NOT IN ('cancelled', 'no_show')
            AND existing.starts_at < ${end.toISOString()}
            AND existing.ends_at > ${start.toISOString()}
        )
      RETURNING
        id,
        organization_id,
        client_id,
        procedure_id,
        professional_id,
        professional_name,
        starts_at,
        ends_at,
        price,
        notes,
        status,
        created_at,
        updated_at
    ),
    links AS (
      INSERT INTO appointment_procedures (
        organization_id,
        appointment_id,
        procedure_id,
        position
      )
      SELECT
        inserted.organization_id,
        inserted.id,
        link.procedure_id,
        link.position
      FROM inserted
      CROSS JOIN LATERAL jsonb_to_recordset(${linksJson}::jsonb)
        AS link(procedure_id uuid, position int)
      RETURNING appointment_id
    )
    SELECT * FROM inserted
  `;

  const appointments =
    normalizedProfessionalId && !bypassConflictCheck
      ? (await sql.transaction([
          sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(
                ${`${organizationId}:${normalizedProfessionalId}`},
                0
              )
            )
          `,
          insertStatement,
        ]))[1]
      : await insertStatement;

  if (!appointments.length) {
    return {
      ok: false,
      status: 409,
      error: "O profissional já possui um agendamento nesse horário.",
    };
  }

  const appointment = appointments[0] as AppointmentRecord;

  await recordCustomerEvent({
    organizationId,
    clientId,
    appointmentId: appointment.id,
    eventType: "appointment.created",
    source: eventSource,
    data: {
      procedureId: normalizedProcedureId,
      procedureIds: normalizedProcedureIds,
      professionalName: normalizedProfessionalName,
      startsAt: appointment.starts_at,
      endsAt: appointment.ends_at,
      price: effectivePrice,
    },
  });

  return { ok: true, appointment };
}
