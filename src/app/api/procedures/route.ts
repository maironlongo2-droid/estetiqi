import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { sql } from "@/lib/db/client";
import { createProcedureSchema } from "@/lib/validation/procedure";

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser(request);
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search")?.trim() || "";
    const requestedStatus = searchParams.get("status");

    const status =
      requestedStatus === "active" || requestedStatus === "inactive"
        ? requestedStatus
        : null;

    const page = Math.max(
      Number.parseInt(searchParams.get("page") || "1", 10),
      1
    );

    const requestedLimit = Number.parseInt(
      searchParams.get("limit") || "20",
      10
    );

    const limit = Math.min(Math.max(requestedLimit, 1), 100);
    const offset = (page - 1) * limit;
    const organizationId = currentUser.organization.id;
    const searchPattern = "%" + search + "%";

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
      WHERE organization_id = ${organizationId}
        AND (
          ${search} = ''
          OR name ILIKE ${searchPattern}
          OR description ILIKE ${searchPattern}
        )
        AND (
          ${status}::varchar IS NULL
          OR status = ${status}::varchar
        )
      ORDER BY name ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const countResult = await sql`
      SELECT COUNT(*)::int AS total
      FROM procedures
      WHERE organization_id = ${organizationId}
        AND (
          ${search} = ''
          OR name ILIKE ${searchPattern}
          OR description ILIKE ${searchPattern}
        )
        AND (
          ${status}::varchar IS NULL
          OR status = ${status}::varchar
        )
    `;

    const total = countResult[0].total;

    return Response.json({
      procedures,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
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

    console.error("List procedures error:", error);

    return Response.json(
      {
        error: "Não foi possível listar os procedimentos.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser(request);

    const body = await request.json();

    const result = createProcedureSchema.safeParse(body);

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
      name,
      description,
      price,
      durationMinutes,
      returnIntervalDays,
      status,
    } = result.data;

    const organizationId = currentUser.organization.id;

    const existingProcedure = await sql`
      SELECT id
      FROM procedures
      WHERE organization_id = ${organizationId}
        AND LOWER(name) = LOWER(${name})
      LIMIT 1
    `;

    if (existingProcedure.length > 0) {
      return Response.json(
        {
          error: "Já existe um procedimento com esse nome.",
        },
        { status: 409 }
      );
    }

    const procedures = await sql`
      INSERT INTO procedures (
        organization_id,
        name,
        description,
        price,
        duration_minutes,
        return_interval_days,
        status
      )
      VALUES (
        ${organizationId},
        ${name},
        ${description || null},
        ${price ?? null},
        ${durationMinutes ?? null},
        ${returnIntervalDays ?? null},
        ${status ?? "active"}
      )
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

    return Response.json(
      {
        procedure: procedures[0],
      },
      { status: 201 }
    );
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

    console.error("Create procedure error:", error);

    return Response.json(
      {
        error: "Não foi possível criar o procedimento.",
      },
      { status: 500 }
    );
  }
}

