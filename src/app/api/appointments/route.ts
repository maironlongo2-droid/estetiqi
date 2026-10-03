import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { recordCustomerEvent } from "@/lib/events/customer-events";
import { sql } from "@/lib/db/client";
import { createAppointmentSchema } from "@/lib/validation/appointment";

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
          a.professional_name,
          a.starts_at,
          a.ends_at,
          a.price,
          a.notes,
          a.status,
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

    const appointments = await sql`
      SELECT
        a.id,
        a.organization_id,
        a.client_id,
        c.name AS client_name,
        a.procedure_id,
        p.name AS procedure_name,
        a.professional_name,
        a.starts_at,
        a.ends_at,
        a.price,
        a.notes,
        a.status,
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
      professionalName,
      startsAt,
      endsAt,
      price,
      notes,
      status,
    } = result.data;

    const organizationId = currentUser.organization.id;

    const clientResult = await sql`
      SELECT id
      FROM clients
      WHERE id = ${clientId}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (clientResult.length === 0) {
      return Response.json(
        { error: "Cliente não encontrado." },
        { status: 404 }
      );
    }

    const normalizedProcedureId = procedureId || null;

    if (normalizedProcedureId) {
      const procedureResult = await sql`
        SELECT id
        FROM procedures
        WHERE id = ${normalizedProcedureId}
          AND organization_id = ${organizationId}
        LIMIT 1
      `;

      if (procedureResult.length === 0) {
        return Response.json(
          { error: "Procedimento não encontrado." },
          { status: 404 }
        );
      }
    }

    const start = new Date(startsAt);
    const end = new Date(endsAt);

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

    if (professionalName) {
      const conflictingAppointment = await sql`
        SELECT id
        FROM appointments
        WHERE organization_id = ${organizationId}
          AND professional_name = ${professionalName}
          AND status NOT IN ('cancelled', 'no_show')
          AND starts_at < ${end.toISOString()}
          AND ends_at > ${start.toISOString()}
        LIMIT 1
      `;

      if (conflictingAppointment.length > 0) {
        return Response.json(
          { error: "O profissional já possui um agendamento nesse horário." },
          { status: 409 }
        );
      }
    }

    const appointments = await sql`
      INSERT INTO appointments (
        organization_id,
        client_id,
        procedure_id,
        professional_name,
        starts_at,
        ends_at,
        price,
        notes,
        status
      )
      VALUES (
        ${organizationId},
        ${clientId},
        ${normalizedProcedureId},
        ${professionalName || null},
        ${start.toISOString()},
        ${end.toISOString()},
        ${price ?? null},
        ${notes || null},
        ${status ?? "scheduled"}
      )
      RETURNING
        id,
        organization_id,
        client_id,
        procedure_id,
        professional_name,
        starts_at,
        ends_at,
        price,
        notes,
        status,
        created_at,
        updated_at
    `;

    const appointment = appointments[0];

    await recordCustomerEvent({
      organizationId,
      clientId,
      appointmentId: appointment.id,
      eventType: "appointment.created",
      source: "system",
      data: {
        procedureId: normalizedProcedureId,
        professionalName: professionalName || null,
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
