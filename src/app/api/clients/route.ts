import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import {
  normalizeCpf,
  normalizePhone,
} from "@/lib/normalization/brazil";
import { createClientSchema } from "@/lib/validation/client";

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "clients", "read")) {
      return Response.json(
        { error: "Você não tem permissão para visualizar clientes." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const sort = searchParams.get("sort") || "name";
    const order = searchParams.get("order") === "desc" ? "desc" : "asc";

    const rawPage = Number(searchParams.get("page") || "1");
    const rawLimit = Number(searchParams.get("limit") || "20");

    const page =
      Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

    const limit =
      Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100
        ? rawLimit
        : 20;

    if (status && !["active", "inactive"].includes(status)) {
      return Response.json(
        { error: "Status inválido." },
        { status: 400 }
      );
    }

    const allowedSorts = new Set([
      "name",
      "created_at",
      "updated_at",
    ]);

    const safeSort = allowedSorts.has(sort) ? sort : "name";
    const safeOrder = order === "desc" ? "DESC" : "ASC";
    const offset = (page - 1) * limit;
    const organizationId = currentUser.organization.id;

    const searchPattern = `%${search}%`;

    const countResult = await sql`
      SELECT COUNT(*)::int AS total
      FROM clients
      WHERE organization_id = ${organizationId}
        AND (
          ${search} = ''
          OR name ILIKE ${searchPattern}
          OR phone ILIKE ${searchPattern}
          OR email ILIKE ${searchPattern}
          OR cpf ILIKE ${searchPattern}
        )
        AND (
          ${status} = ''
          OR status = ${status}
        )
    `;

    const total = countResult[0]?.total ?? 0;

    const clients =
      safeSort === "created_at"
        ? await sql`
            SELECT
              id,
              name,
              phone,
              email,
              cpf,
              birth_date,
              notes,
              status,
              source,
              created_at,
              updated_at
            FROM clients
            WHERE organization_id = ${organizationId}
              AND (
                ${search} = ''
                OR name ILIKE ${searchPattern}
                OR phone ILIKE ${searchPattern}
                OR email ILIKE ${searchPattern}
                OR cpf ILIKE ${searchPattern}
              )
              AND (
                ${status} = ''
                OR status = ${status}
              )
            ORDER BY created_at ${safeOrder}, name ASC
            LIMIT ${limit}
            OFFSET ${offset}
          `
        : safeSort === "updated_at"
          ? await sql`
              SELECT
                id,
                name,
                phone,
                email,
                cpf,
                birth_date,
                notes,
                status,
                source,
                created_at,
                updated_at
              FROM clients
              WHERE organization_id = ${organizationId}
                AND (
                  ${search} = ''
                  OR name ILIKE ${searchPattern}
                  OR phone ILIKE ${searchPattern}
                  OR email ILIKE ${searchPattern}
                  OR cpf ILIKE ${searchPattern}
                )
                AND (
                  ${status} = ''
                  OR status = ${status}
                )
              ORDER BY updated_at ${safeOrder}, name ASC
              LIMIT ${limit}
              OFFSET ${offset}
            `
          : order === "desc"
            ? await sql`
                SELECT
                  id,
                  name,
                  phone,
                  email,
                  cpf,
                  birth_date,
                  notes,
                  status,
                  source,
                  created_at,
                  updated_at
                FROM clients
                WHERE organization_id = ${organizationId}
                  AND (
                    ${search} = ''
                    OR name ILIKE ${searchPattern}
                    OR phone ILIKE ${searchPattern}
                    OR email ILIKE ${searchPattern}
                    OR cpf ILIKE ${searchPattern}
                  )
                  AND (
                    ${status} = ''
                    OR status = ${status}
                  )
                ORDER BY name DESC, id ASC
                LIMIT ${limit}
                OFFSET ${offset}
              `
            : await sql`
                SELECT
                  id,
                  name,
                  phone,
                  email,
                  cpf,
                  birth_date,
                  notes,
                  status,
                  source,
                  created_at,
                  updated_at
                FROM clients
                WHERE organization_id = ${organizationId}
                  AND (
                    ${search} = ''
                    OR name ILIKE ${searchPattern}
                    OR phone ILIKE ${searchPattern}
                    OR email ILIKE ${searchPattern}
                    OR cpf ILIKE ${searchPattern}
                  )
                  AND (
                    ${status} = ''
                    OR status = ${status}
                  )
                ORDER BY name ASC, id ASC
                LIMIT ${limit}
                OFFSET ${offset}
              `;

    return Response.json({
      clients,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      sort: safeSort,
      order,
      filters: {
        search,
        status,
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

    console.error("List clients error:", error);

    return Response.json(
      { error: "Não foi possível listar os clientes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "clients", "create")) {
      return Response.json(
        { error: "Você não tem permissão para criar clientes." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = createClientSchema.safeParse(body);

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
      phone,
      email,
      cpf,
      birthDate,
      notes,
      source,
      status,
    } = result.data;

    const organizationId = currentUser.organization.id;

    const normalizedPhone = normalizePhone(phone);
    const normalizedCpf = normalizeCpf(cpf);
    const normalizedEmail = email || null;

    const existingClient = await sql`
      SELECT id
      FROM clients
      WHERE organization_id = ${organizationId}
        AND (
          (${normalizedPhone}::text IS NOT NULL AND phone = ${normalizedPhone})
          OR (${normalizedEmail}::text IS NOT NULL AND email = ${normalizedEmail})
          OR (${normalizedCpf}::text IS NOT NULL AND cpf = ${normalizedCpf})
        )
      LIMIT 1
    `;

    if (existingClient.length > 0) {
      return Response.json(
        { error: "Já existe um cliente com esses dados." },
        { status: 409 }
      );
    }

    const clientResult = await sql`
      INSERT INTO clients (
        organization_id,
        name,
        phone,
        email,
        cpf,
        birth_date,
        notes,
        source,
        status
      )
      VALUES (
        ${organizationId},
        ${name},
        ${normalizedPhone},
        ${normalizedEmail},
        ${normalizedCpf},
        ${birthDate || null},
        ${notes || null},
        ${source || null},
        ${status || "active"}
      )
      RETURNING
        id,
        organization_id,
        name,
        phone,
        email,
        cpf,
        birth_date,
        notes,
        status,
        source,
        created_at,
        updated_at
    `;

    return Response.json(
      { client: clientResult[0] },
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

    console.error("Create client error:", error, JSON.stringify(error, Object.getOwnPropertyNames(error)));

    return Response.json(
      { error: "Não foi possível criar o cliente." },
      { status: 500 }
    );
  }
}
