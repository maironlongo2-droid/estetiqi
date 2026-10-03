import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { recordCustomerEvent } from "@/lib/events/customer-events";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { updateAppointmentSchema } from "@/lib/validation/appointment";

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

    const procedureId =
      data.procedureId !== undefined
        ? data.procedureId || null
        : current.procedure_id;

    const professionalName =
      data.professionalName !== undefined
        ? data.professionalName || null
        : current.professional_name;

    const startsAt =
      data.startsAt !== undefined
        ? new Date(data.startsAt)
        : new Date(current.starts_at);

    const endsAt =
      data.endsAt !== undefined
        ? new Date(data.endsAt)
        : new Date(current.ends_at);

    const price =
      data.price !== undefined
        ? data.price
        : current.price;

    const notes =
      data.notes !== undefined
        ? data.notes || null
        : current.notes;

    const status =
      data.status ?? current.status;

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
      SELECT id
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

    if (procedureId) {
      const procedureResult = await sql`
        SELECT id
        FROM procedures
        WHERE id = ${procedureId}
          AND organization_id = ${organizationId}
        LIMIT 1
      `;

      if (procedureResult.length === 0) {
        return Response.json(
          {
            error: "Procedimento não encontrado.",
          },
          { status: 404 }
        );
      }
    }

    if (professionalName) {
      const conflict = await sql`
        SELECT id
        FROM appointments
        WHERE organization_id = ${organizationId}
          AND id <> ${id}
          AND professional_name = ${professionalName}
          AND status NOT IN ('cancelled', 'no_show')
          AND starts_at < ${endsAt.toISOString()}
          AND ends_at > ${startsAt.toISOString()}
        LIMIT 1
      `;

      if (conflict.length > 0) {
        return Response.json(
          {
            error:
              "O profissional já possui um agendamento nesse horário.",
          },
          { status: 409 }
        );
      }
    }

    const result = await sql`
      UPDATE appointments
      SET
        client_id = ${clientId},
        procedure_id = ${procedureId},
        professional_name = ${professionalName},
        starts_at = ${startsAt.toISOString()},
        ends_at = ${endsAt.toISOString()},
        price = ${price ?? null},
        notes = ${notes},
        status = ${status},
        updated_at = NOW()
      WHERE id = ${id}
        AND organization_id = ${organizationId}
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
          professionalName,
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