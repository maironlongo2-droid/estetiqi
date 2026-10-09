import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { recordCustomerEvent } from "@/lib/events/customer-events";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { updateAppointmentSchema } from "@/lib/validation/appointment";
import { checkProfessionalAvailability } from "@/lib/appointments/availability";
import {
  appointmentProceduresSelect,
  loadAppointmentProcedures,
  procedureLinksJson,
} from "@/lib/appointments/procedures";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "appointments", "read")) {
      return Response.json(
        {
          error: "Você não tem permissão para visualizar agendamentos.",
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const result = await sql`
      SELECT
        a.id,
        a.organization_id,
        a.client_id,
        c.name AS client_name,
        a.procedure_id,
        p.name AS procedure_name,
        ${appointmentProceduresSelect()} AS procedures,
        a.professional_id,
        a.professional_name,
        a.starts_at,
        a.ends_at,
        a.price,
        a.notes,
        a.status,
        EXISTS (
          SELECT 1
          FROM payments payment
          WHERE payment.organization_id = a.organization_id
            AND payment.appointment_id = a.id
        ) AS has_payments,
        a.created_at,
        a.updated_at
      FROM appointments a
      JOIN clients c
        ON c.id = a.client_id
      LEFT JOIN procedures p
        ON p.id = a.procedure_id
      WHERE a.id = ${id}
        AND a.organization_id = ${currentUser.organization.id}
      LIMIT 1
    `;

    if (result.length === 0) {
      return Response.json(
        {
          error: "Agendamento não encontrado.",
        },
        { status: 404 }
      );
    }

    return Response.json({
      appointment: result[0],
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "UNAUTHENTICATED"
    ) {
      return Response.json(
        {
          error: "Não autenticado.",
        },
        { status: 401 }
      );
    }

    console.error("Get appointment error:", error);

    return Response.json(
      {
        error: "Não foi possível consultar o agendamento.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "appointments", "update")) {
      return Response.json(
        {
          error: "Você não tem permissão para atualizar agendamentos.",
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const body = await request.json();

    const validation = updateAppointmentSchema.safeParse(body);

    if (!validation.success) {
      return Response.json(
        {
          error: "Dados inválidos.",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = validation.data;
    const organizationId = currentUser.organization.id;

    const existing = await sql`
      SELECT
        id,
        client_id,
        procedure_id,
        professional_id,
        professional_name,
        starts_at,
        ends_at,
        price,
        notes,
        status
      FROM appointments
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (existing.length === 0) {
      return Response.json(
        {
          error: "Agendamento não encontrado.",
        },
        { status: 404 }
      );
    }

    const current = existing[0];

    const clientId =
      data.clientId ?? current.client_id;

    const requestedProcedureIds: string[] | undefined =
      data.procedureIds !== undefined
        ? Array.from(new Set(data.procedureIds.filter(Boolean)))
        : data.procedureId !== undefined
          ? data.procedureId
            ? [data.procedureId]
            : []
          : undefined;

    const procedureId =
      requestedProcedureIds !== undefined
        ? requestedProcedureIds[0] ?? null
        : current.procedure_id;

    const professionalId =
      data.professionalId !== undefined
        ? data.professionalId || null
        : current.professional_id;
    let resolvedProfessionalName =
      data.professionalId !== undefined
        ? null
        : current.professional_name;

    const startsAt =
      data.startsAt !== undefined
        ? new Date(data.startsAt)
        : new Date(current.starts_at);

    let endsAt =
      data.endsAt !== undefined
        ? new Date(data.endsAt)
        : data.startsAt !== undefined
          ? new Date(
              startsAt.getTime() +
                (new Date(current.ends_at).getTime() -
                  new Date(current.starts_at).getTime())
            )
          : new Date(current.ends_at);

    let price =
      data.price !== undefined
        ? data.price
        : current.price;

    const notes =
      data.notes !== undefined
        ? data.notes || null
        : current.notes;

    const status =
      data.status ?? current.status;
    const wasActiveAppointment = ["scheduled", "confirmed"].includes(
      current.status
    );
    const isActiveAppointment = ["scheduled", "confirmed"].includes(status);
    const becomesActiveAppointment =
      !wasActiveAppointment && isActiveAppointment;

    if (
      Number.isNaN(startsAt.getTime()) ||
      Number.isNaN(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      return Response.json(
        {
          error: "Intervalo de horário inválido.",
        },
        { status: 400 }
      );
    }

    const clientResult = await sql`
      SELECT id, status
      FROM clients
      WHERE id = ${clientId}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (clientResult.length === 0) {
      return Response.json(
        {
          error: "Cliente não encontrado.",
        },
        { status: 404 }
      );
    }

    if (
      data.clientId !== undefined &&
      data.clientId !== current.client_id &&
      clientResult[0].status !== "active"
    ) {
      return Response.json(
        { error: "Cliente inativo não pode receber novos agendamentos." },
        { status: 409 }
      );
    }

    const intervalChanged =
      data.startsAt !== undefined ||
      data.endsAt !== undefined ||
      data.procedureId !== undefined ||
      data.procedureIds !== undefined ||
      data.professionalId !== undefined;
    const shouldValidateAvailability =
      isActiveAppointment &&
      (intervalChanged ||
        becomesActiveAppointment ||
        (wasActiveAppointment && status !== current.status));

    if (data.clientId !== undefined && data.clientId !== current.client_id) {
      const linkedPayments = await sql`
        SELECT 1
        FROM payments
        WHERE organization_id = ${organizationId}
          AND appointment_id = ${id}
        LIMIT 1
      `;
      if (linkedPayments.length > 0) {
        return Response.json(
          { error: "Não é possível trocar a cliente de um atendimento com pagamento vinculado." },
          { status: 409 }
        );
      }
    }
    let effectiveProcedureIds: string[] = [];
    if (requestedProcedureIds !== undefined) {
      effectiveProcedureIds = requestedProcedureIds;
    } else if (shouldValidateAvailability) {
      const links = (await sql`
        SELECT procedure_id
        FROM appointment_procedures
        WHERE organization_id = ${organizationId}
          AND appointment_id = ${id}
        ORDER BY position
      `) as Array<{ procedure_id: string }>;
      effectiveProcedureIds = links.length
        ? links.map((link) => link.procedure_id)
        : current.procedure_id
          ? [current.procedure_id]
          : [];
    }

    if (
      effectiveProcedureIds.length > 0 &&
      (shouldValidateAvailability || requestedProcedureIds !== undefined)
    ) {
      const proceduresResult = await loadAppointmentProcedures(
        organizationId,
        effectiveProcedureIds,
        { requireActive: shouldValidateAvailability }
      );

      if (!proceduresResult.ok) {
        return Response.json(
          { error: proceduresResult.error },
          { status: proceduresResult.status }
        );
      }

      // Recalcula a duração total (fim) a partir dos procedimentos válidos.
      if (proceduresResult.totalDurationMinutes) {
        endsAt = new Date(
          startsAt.getTime() + proceduresResult.totalDurationMinutes * 60_000
        );
      }

      // Ao trocar a lista de procedimentos, o preço total também é
      // recalculado no servidor.
      if (
        requestedProcedureIds !== undefined &&
        proceduresResult.totalPrice !== null
      ) {
        price = proceduresResult.totalPrice;
      }
    }

    if (
      professionalId &&
      (shouldValidateAvailability || data.professionalId !== undefined)
    ) {
      const professionalResult = await sql`
        SELECT id, name
        FROM professionals
        WHERE id = ${professionalId}
          AND organization_id = ${organizationId}
          ${shouldValidateAvailability ? sql`AND active = TRUE` : sql``}
        LIMIT 1
      `;

      if (professionalResult.length === 0) {
        return Response.json(
          { error: "Profissional não encontrado ou inativo." },
          { status: 404 }
        );
      }

      resolvedProfessionalName = professionalResult[0].name;

      if (effectiveProcedureIds.length > 0 && shouldValidateAvailability) {
        const assignments = await sql`
          SELECT procedure_id
          FROM professional_procedures
          WHERE professional_id = ${professionalId}
            AND organization_id = ${organizationId}
            AND procedure_id = ANY(${effectiveProcedureIds}::uuid[])
        `;

        if (assignments.length !== effectiveProcedureIds.length) {
          return Response.json(
            { error: "O profissional não está habilitado para este procedimento." },
            { status: 409 }
          );
        }
      }
    }

    if (professionalId && shouldValidateAvailability) {
      const availability = await checkProfessionalAvailability({
        organizationId,
        professionalId,
        startsAt,
        endsAt,
        excludeAppointmentId: id,
      });

      if (!availability.isAvailable) {
        return Response.json(
          {
            error:
              availability.reason === "appointment_conflict"
                ? "O profissional já possui um agendamento nesse horário."
                : availability.reason === "blocked"
                  ? "Este horário está bloqueado para o profissional."
                  : "O horário não está dentro da disponibilidade do profissional.",
          },
          { status: 409 }
        );
      }
    }

    const bypassConflictCheck =
      !professionalId ||
      status === "cancelled" ||
      status === "no_show" ||
      !shouldValidateAvailability;
    const rewriteLinks = requestedProcedureIds !== undefined;
    const linksJson = procedureLinksJson(effectiveProcedureIds);
    const updateAppointment = sql`
      WITH updated AS (
        UPDATE appointments
        SET
          client_id = ${clientId},
          procedure_id = ${procedureId},
          professional_id = ${professionalId},
          professional_name = ${resolvedProfessionalName},
          starts_at = ${startsAt.toISOString()},
          ends_at = ${endsAt.toISOString()},
          price = ${price ?? null},
          notes = ${notes},
          status = ${status},
          updated_at = NOW()
        WHERE id = ${id}
          AND organization_id = ${organizationId}
          AND (
            ${bypassConflictCheck}
            OR NOT EXISTS (
              SELECT 1
              FROM appointments existing
              WHERE existing.organization_id = ${organizationId}
                AND existing.id <> ${id}
                AND (
                  existing.professional_id = ${professionalId}
                  OR (
                    existing.professional_id IS NULL
                    AND existing.professional_name = ${resolvedProfessionalName}
                  )
                )
                AND existing.status NOT IN ('cancelled', 'no_show')
                AND existing.starts_at < ${endsAt.toISOString()}
                AND existing.ends_at > ${startsAt.toISOString()}
            )
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
      upserted AS (
        INSERT INTO appointment_procedures (
          organization_id,
          appointment_id,
          procedure_id,
          position
        )
        SELECT
          updated.organization_id,
          updated.id,
          link.procedure_id,
          link.position
        FROM updated
        CROSS JOIN LATERAL jsonb_to_recordset(${linksJson}::jsonb)
          AS link(procedure_id uuid, position int)
        WHERE ${rewriteLinks}
        ON CONFLICT (appointment_id, procedure_id)
          DO UPDATE SET position = EXCLUDED.position
        RETURNING appointment_id
      ),
      pruned AS (
        DELETE FROM appointment_procedures link
        USING updated
        WHERE link.appointment_id = updated.id
          AND ${rewriteLinks}
          AND link.procedure_id <> ALL(${effectiveProcedureIds}::uuid[])
        RETURNING appointment_id
      )
      SELECT * FROM updated
    `;
    const result =
      professionalId && !bypassConflictCheck
        ? (await sql.transaction([
            sql`
              SELECT pg_advisory_xact_lock(
                hashtextextended(
                  ${`${organizationId}:${professionalId}`},
                  0
                )
              )
            `,
            updateAppointment,
          ]))[1]
        : await updateAppointment;

    if (!result.length) {
      return Response.json(
        { error: "O profissional já possui um agendamento nesse horário." },
        { status: 409 }
      );
    }

    if (status !== current.status) {
      await recordCustomerEvent({
        organizationId,
        clientId,
        appointmentId: id,
        eventType: `appointment.${status}`,
        source: "system",
        data: {
          previousStatus: current.status,
          newStatus: status,
          procedureId,
          procedureIds: effectiveProcedureIds,
          professionalName: resolvedProfessionalName,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          price: price ?? null,
        },
      });
    }

    return Response.json({
      appointment: result[0],
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "UNAUTHENTICATED"
    ) {
      return Response.json(
        {
          error: "Não autenticado.",
        },
        { status: 401 }
      );
    }

    console.error("Update appointment error:", error);

    return Response.json(
      {
        error: "Não foi possível atualizar o agendamento.",
      },
      { status: 500 }
    );
  }
}