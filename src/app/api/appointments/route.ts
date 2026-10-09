import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { recordCustomerEvent } from "@/lib/events/customer-events";
import { sql } from "@/lib/db/client";
import { createAppointmentSchema } from "@/lib/validation/appointment";
import { checkProfessionalAvailability } from "@/lib/appointments/availability";

// Limite defensivo para a consulta por intervalo (?from&to), em dias inclusivos.
const MAX_APPOINTMENTS_RANGE_DAYS = 92;

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "appointments", "read")) {
      return Response.json(
        { error: "Você não tem permissão para visualizar agendamentos." },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const date = url.searchParams.get("date");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const status = url.searchParams.get("status");

    const organizationId = currentUser.organization.id;

    if (date) {
      const start = new Date(`${date}T00:00:00-03:00`);
      const end = new Date(`${date}T23:59:59.999-03:00`);

      const appointments = await sql`
        SELECT
          a.id,
          a.organization_id,
          a.client_id,
          c.name AS client_name,
          a.procedure_id,
          p.name AS procedure_name,
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
          AND c.organization_id = ${organizationId}
        LEFT JOIN procedures p
          ON p.id = a.procedure_id
          AND p.organization_id = ${organizationId}
        WHERE a.organization_id = ${organizationId}
          AND a.starts_at >= ${start.toISOString()}
          AND a.starts_at <= ${end.toISOString()}
          ${status ? sql`AND a.status = ${status}` : sql``}
        ORDER BY a.starts_at ASC
      `;

      return Response.json({
        appointments,
        date,
        pagination: {
          page: 1,
          limit: appointments.length,
          total: appointments.length,
          totalPages: appointments.length > 0 ? 1 : 0,
        },
      });
    }

    if (from || to) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/;
      const isValidDate = (value: string | null): value is string =>
        Boolean(
          value &&
            datePattern.test(value) &&
            !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
            new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
        );

      if (!isValidDate(from) || !isValidDate(to)) {
        return Response.json({ error: "Período inválido." }, { status: 400 });
      }

      const start = new Date(`${from}T00:00:00-03:00`);
      const end = new Date(`${to}T23:59:59.999-03:00`);

      if (start.getTime() > end.getTime()) {
        return Response.json({ error: "Período inválido." }, { status: 400 });
      }

      const rangeDays =
        Math.round(
          (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
            86_400_000
        ) + 1;

      if (rangeDays > MAX_APPOINTMENTS_RANGE_DAYS) {
        return Response.json(
          { error: "Período acima do limite permitido." },
          { status: 400 }
        );
      }

      const appointments = await sql`
        SELECT
          a.id,
          a.organization_id,
          a.client_id,
          c.name AS client_name,
          a.procedure_id,
          p.name AS procedure_name,
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
          AND c.organization_id = ${organizationId}
        LEFT JOIN procedures p
          ON p.id = a.procedure_id
          AND p.organization_id = ${organizationId}
        WHERE a.organization_id = ${organizationId}
          AND a.starts_at >= ${start.toISOString()}
          AND a.starts_at <= ${end.toISOString()}
          ${status ? sql`AND a.status = ${status}` : sql``}
        ORDER BY a.starts_at ASC
      `;

      return Response.json({
        appointments,
        from,
        to,
        pagination: {
          page: 1,
          limit: appointments.length,
          total: appointments.length,
          totalPages: appointments.length > 0 ? 1 : 0,
        },
      });
    }

    const appointments = await sql`
      SELECT
        a.id,
        a.organization_id,
        a.client_id,
        c.name AS client_name,
        a.procedure_id,
        p.name AS procedure_name,
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
        AND c.organization_id = ${organizationId}
      LEFT JOIN procedures p
        ON p.id = a.procedure_id
        AND p.organization_id = ${organizationId}
      WHERE a.organization_id = ${organizationId}
        ${status ? sql`AND a.status = ${status}` : sql``}
      ORDER BY a.starts_at ASC
      LIMIT 100
    `;

    return Response.json({
      appointments,
      pagination: {
        page: 1,
        limit: 100,
        total: appointments.length,
        totalPages: appointments.length > 0 ? 1 : 0,
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

    console.error("List appointments error:", error);

    return Response.json(
      { error: "Não foi possível listar os agendamentos." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "appointments", "create")) {
      return Response.json(
        { error: "Você não tem permissão para criar agendamentos." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = createAppointmentSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        {
          error: "Dados inválidos.",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      clientId,
      procedureId,
      professionalId,
      startsAt,
      endsAt,
      price,
      notes,
      status,
    } = result.data;

    const organizationId = currentUser.organization.id;

    const clientResult = await sql`
      SELECT id, status
      FROM clients
      WHERE id = ${clientId}
        AND organization_id = ${organizationId}
        AND status = 'active'
      LIMIT 1
    `;

    if (clientResult.length === 0) {
      return Response.json(
        { error: "Cliente não encontrado ou inativo." },
        { status: 404 }
      );
    }

    const normalizedProcedureId = procedureId || null;
    const normalizedProfessionalId = professionalId || null;
    let normalizedProfessionalName: string | null = null;

    let procedureDurationMinutes: number | null = null;
    if (normalizedProcedureId) {
      const procedureResult = await sql`
        SELECT id, duration_minutes
        FROM procedures
        WHERE id = ${normalizedProcedureId}
          AND organization_id = ${organizationId}
          AND status = 'active'
        LIMIT 1
      `;

      if (procedureResult.length === 0) {
        return Response.json(
          { error: "Procedimento não encontrado ou inativo." },
          { status: 404 }
        );
      }
      procedureDurationMinutes = procedureResult[0].duration_minutes;
    }

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
        return Response.json(
          { error: "Profissional não encontrado ou inativo." },
          { status: 404 }
        );
      }

      normalizedProfessionalName = professionalResult[0].name;

      if (normalizedProcedureId) {
        const assignment = await sql`
          SELECT 1
          FROM professional_procedures
          WHERE professional_id = ${normalizedProfessionalId}
            AND procedure_id = ${normalizedProcedureId}
            AND organization_id = ${organizationId}
          LIMIT 1
        `;

        if (assignment.length === 0) {
          return Response.json(
            { error: "O profissional não está habilitado para este procedimento." },
            { status: 409 }
          );
        }
      }
    }

    const start = new Date(startsAt);
    const requestedEnd = new Date(endsAt);
    const end =
      procedureDurationMinutes && !Number.isNaN(start.getTime())
        ? new Date(start.getTime() + procedureDurationMinutes * 60_000)
        : requestedEnd;

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      return Response.json(
        { error: "Intervalo de horário inválido." },
        { status: 400 }
      );
    }

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
      !normalizedProfessionalId ||
      status === "cancelled" ||
      status === "no_show";
    const insertStatement = sql`
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
        ${price ?? null},
        ${notes || null},
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
      return Response.json(
        { error: "O profissional já possui um agendamento nesse horário." },
        { status: 409 }
      );
    }

    const appointment = appointments[0];

    await recordCustomerEvent({
      organizationId,
      clientId,
      appointmentId: appointment.id,
      eventType: "appointment.created",
      source: "system",
      data: {
        procedureId: normalizedProcedureId,
        professionalName: normalizedProfessionalName,
        startsAt: appointment.starts_at,
        endsAt: appointment.ends_at,
        price: price ?? null,
      },
    });

    return Response.json(
      { appointment },
      { status: 201 }
    );
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

    console.error("Create appointment error:", error);

    return Response.json(
      { error: "Não foi possível criar o agendamento." },
      { status: 500 }
    );
  }
}
