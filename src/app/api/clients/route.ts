import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { sql } from "@/lib/db/client";
import {
  normalizeCpf,
  normalizePhone,
} from "@/lib/normalization/brazil";
import { createClientSchema } from "@/lib/validation/client";

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser(request);

    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";

    const rawPage = Number(searchParams.get("page") || "1");
    const rawLimit = Number(searchParams.get("limit") || "20");

    const page =
      Number.isInteger(rawPage) && rawPage >= 1
        ? rawPage
        : 1;

    const limit =
      Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 100
        ? rawLimit
        : 20;

    if (status && !["active", "inactive"].includes(status)) {
      return Response.json(
        {
          error: "Status inválido.",
        },
        { status: 400 }
      );
    }

    const offset = (page - 1) * limit;

    const organizationId = currentUser.organization.id;

    const countResult = await sql`
      SELECT COUNT(*)::int AS total
      FROM clients
      WHERE organization_id = ${organizationId}
        AND (
          ${search} = ''
          OR name ILIKE ${`%${search}%`}
          OR phone ILIKE ${`%${search}%`}
          OR email ILIKE ${`%${search}%`}
          OR cpf ILIKE ${`%${search}%`}
        )
        AND (
          ${status} = ''
          OR status = ${status}
        )
    `;

    const total = countResult[0].total;

    const clients = await sql`
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
          OR name ILIKE ${`%${search}%`}
          OR phone ILIKE ${`%${search}%`}
          OR email ILIKE ${`%${search}%`}
          OR cpf ILIKE ${`%${search}%`}
        )
        AND (
          ${status} = ''
          OR status = ${status}
        )
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const totalPages = Math.ceil(total / limit);

    return Response.json({
      clients,
      total,
      page,
      limit,
      totalPages,
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

    console.error("List clients error:", error);

    return Response.json(
      {
        error: "Não foi possível listar os clientes.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser(request);

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
          phone = ${normalizedPhone}
          OR email = ${normalizedEmail}
          OR cpf = ${normalizedCpf}
        )
      LIMIT 1
    `;

    if (existingClient.length > 0) {
      return Response.json(
        {
          error: "Já existe um cliente com esses dados.",
        },
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
      {
        client: clientResult[0],
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

    console.error("Create client error:", error);

    return Response.json(
      {
        error: "Não foi possível criar o cliente.",
      },
      { status: 500 }
    );
  }
}