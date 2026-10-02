import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { updateProcedureSchema } from "@/lib/validation/procedure";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser(request);

    if (!hasPermission(currentUser.role, "procedures", "read")) {
      return Response.json(
        {
          error: "Você não tem permissão para visualizar procedimentos.",
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const organizationId = currentUser.organization.id;

    const procedures = await sql`
      SELECT
        id,
        organization_id,
        name,
        description,
        price,
        duration_minutes,
        return_interval_days,
        status,
        created_at,
        updated_at
      FROM procedures
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (procedures.length === 0) {
      return Response.json(
        {
          error: "Procedimento não encontrado.",
        },
        { status: 404 }
      );
    }

    return Response.json({
      procedure: procedures[0],
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

    console.error("Get procedure error:", error);

    return Response.json(
      {
        error: "Não foi possível buscar o procedimento.",
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
    const currentUser = await requireCurrentUser(request);

    if (!hasPermission(currentUser.role, "procedures", "update")) {
      return Response.json(
        {
          error: "Você não tem permissão para atualizar procedimentos.",
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const body = await request.json();

    const result = updateProcedureSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        {
          error: "Dados inválidos.",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const organizationId = currentUser.organization.id;

    const existingProcedure = await sql`
      SELECT
        id,
        name,
        description,
        price,
        duration_minutes,
        return_interval_days,
        status
      FROM procedures
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (existingProcedure.length === 0) {
      return Response.json(
        {
          error: "Procedimento não encontrado.",
        },
        { status: 404 }
      );
    }

    const {
      name,
      description,
      price,
      durationMinutes,
      returnIntervalDays,
      status,
    } = result.data;

    const finalName =
      name !== undefined
        ? name
        : existingProcedure[0].name;

    const duplicateProcedure = await sql`
      SELECT id
      FROM procedures
      WHERE organization_id = ${organizationId}
        AND id <> ${id}
        AND LOWER(name) = LOWER(${finalName})
      LIMIT 1
    `;

    if (duplicateProcedure.length > 0) {
      return Response.json(
        {
          error: "Já existe outro procedimento com esse nome.",
        },
        { status: 409 }
      );
    }

    const updatedProcedures = await sql`
      UPDATE procedures
      SET
        name = COALESCE(${name ?? null}, name),
        description = COALESCE(
          ${description ?? null},
          description
        ),
        price = COALESCE(
          ${price ?? null},
          price
        ),
        duration_minutes = COALESCE(
          ${durationMinutes ?? null},
          duration_minutes
        ),
        return_interval_days = COALESCE(
          ${returnIntervalDays ?? null},
          return_interval_days
        ),
        status = COALESCE(
          ${status ?? null},
          status
        ),
        updated_at = NOW()
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      RETURNING
        id,
        organization_id,
        name,
        description,
        price,
        duration_minutes,
        return_interval_days,
        status,
        created_at,
        updated_at
    `;

    return Response.json({
      procedure: updatedProcedures[0],
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

    console.error("Update procedure error:", error);

    return Response.json(
      {
        error: "Não foi possível atualizar o procedimento.",
      },
      { status: 500 }
    );
  }
}
