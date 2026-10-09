import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { createAppointmentSchema } from "@/lib/validation/appointment";
import { createAppointmentRecord } from "@/lib/appointments/create-appointment";
import {
  appointmentProceduresSelect,
  normalizeProcedureIds,
} from "@/lib/appointments/procedures";

// Limite defensivo para a consulta por intervalo (?from&to), em dias inclusivos.
const MAX_APPOINTMENTS_RANGE_DAYS = 92;

// Formato esperado de um identificador de profissional (UUID). Usado apenas
// para rejeitar entradas inválidas antes de consultar o banco.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Filtro opcional por profissional. Vem por identificador (nunca pelo nome)
    // e é sempre combinado com a organização da sessão na consulta abaixo.
    const professionalId = url.searchParams.get("professionalId");

    if (professionalId && !UUID_PATTERN.test(professionalId)) {
      return Response.json(
        { error: "Profissional inválido." },
        { status: 400 }
      );
    }

    const organizationId = currentUser.organization.id;
    const professionalFilter = professionalId
      ? sql`AND a.professional_id = ${professionalId}::uuid`
      : sql``;

    if (date) {
      const start = new Date(`${date}T00:00:00-03:00`);
      const end = new Date(`${date}T23:59:59.999-03:00`);

      const appointments = await sql`
        SELECT
          a.id,
          a.organization_id,
          a.client_id,
          c.name AS client_name,
          c.phone AS client_phone,
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
          AND c.organization_id = ${organizationId}
        LEFT JOIN procedures p
          ON p.id = a.procedure_id
          AND p.organization_id = ${organizationId}
        WHERE a.organization_id = ${organizationId}
          AND a.starts_at >= ${start.toISOString()}
          AND a.starts_at <= ${end.toISOString()}
          ${status ? sql`AND a.status = ${status}` : sql``}
          ${professionalFilter}
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
          c.phone AS client_phone,
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
          AND c.organization_id = ${organizationId}
        LEFT JOIN procedures p
          ON p.id = a.procedure_id
          AND p.organization_id = ${organizationId}
        WHERE a.organization_id = ${organizationId}
          AND a.starts_at >= ${start.toISOString()}
          AND a.starts_at <= ${end.toISOString()}
          ${status ? sql`AND a.status = ${status}` : sql``}
          ${professionalFilter}
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
          c.phone AS client_phone,
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
        AND c.organization_id = ${organizationId}
      LEFT JOIN procedures p
        ON p.id = a.procedure_id
        AND p.organization_id = ${organizationId}
      WHERE a.organization_id = ${organizationId}
        ${status ? sql`AND a.status = ${status}` : sql``}
        ${professionalFilter}
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
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
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
      procedureIds,
      professionalId,
      startsAt,
      endsAt,
      price,
      notes,
      status,
    } = result.data;

    const outcome = await createAppointmentRecord({
      organizationId: currentUser.organization.id,
      clientId,
      procedureIds: normalizeProcedureIds({ procedureId, procedureIds }),
      professionalId: professionalId || null,
      startsAt,
      endsAt,
      price: price ?? null,
      notes: notes || null,
      status,
      eventSource: "system",
    });

    if (!outcome.ok) {
      return Response.json(
        { error: outcome.error },
        { status: outcome.status }
      );
    }

    return Response.json({ appointment: outcome.appointment }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
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
