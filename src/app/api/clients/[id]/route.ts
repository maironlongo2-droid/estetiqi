import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import {
  normalizeCpf,
  normalizePhone,
} from "@/lib/normalization/brazil";
import { updateClientSchema } from "@/lib/validation/client";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "clients", "read")) {
      return Response.json(
        {
          error: "Você não tem permissão para visualizar clientes.",
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const organizationId = currentUser.organization.id;

    const clients = await sql`
      SELECT
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
      FROM clients
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (clients.length === 0) {
      return Response.json(
        {
          error: "Cliente não encontrado.",
        },
        { status: 404 }
      );
    }

    return Response.json({
      client: clients[0],
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

    console.error("Get client error:", error);

    return Response.json(
      {
        error: "Não foi possível buscar o cliente.",
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

    if (!hasPermission(currentUser.role, "clients", "update")) {
      return Response.json(
        {
          error: "Você não tem permissão para atualizar clientes.",
        },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const body = await request.json();

    const result = updateClientSchema.safeParse(body);

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

    const existingClient = await sql`
      SELECT
        id,
        phone,
        email,
        cpf
      FROM clients
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;

    if (existingClient.length === 0) {
      return Response.json(
        {
          error: "Cliente não encontrado.",
        },
        { status: 404 }
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

    const normalizedPhone =
      phone !== undefined
        ? normalizePhone(phone)
        : undefined;

    const normalizedCpf =
      cpf !== undefined
        ? normalizeCpf(cpf)
        : undefined;

    const normalizedEmail =
      email !== undefined
        ? email || null
        : undefined;

    const finalPhone =
      normalizedPhone !== undefined
        ? normalizedPhone
        : existingClient[0].phone;

    const finalEmail =
      normalizedEmail !== undefined
        ? normalizedEmail
        : existingClient[0].email;

    const finalCpf =
      normalizedCpf !== undefined
        ? normalizedCpf
        : existingClient[0].cpf;

    const duplicateClient = await sql`
      SELECT id
      FROM clients
      WHERE organization_id = ${organizationId}
        AND id <> ${id}
        AND (
          phone = ${finalPhone}
          OR email = ${finalEmail}
          OR cpf = ${finalCpf}
        )
      LIMIT 1
    `;

    if (duplicateClient.length > 0) {
      return Response.json(
        {
          error: "Já existe outro cliente com esses dados.",
        },
        { status: 409 }
      );
    }

    const updatedClient = await sql`
      UPDATE clients
      SET
        name = COALESCE(${name ?? null}, name),
        phone = COALESCE(
          ${normalizedPhone ?? null},
          phone
        ),
        email = COALESCE(
          ${normalizedEmail ?? null},
          email
        ),
        cpf = COALESCE(
          ${normalizedCpf ?? null},
          cpf
        ),
        birth_date = COALESCE(
          ${birthDate ?? null},
          birth_date
        ),
        notes = COALESCE(
          ${notes ?? null},
          notes
        ),
        source = COALESCE(
          ${source ?? null},
          source
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

    return Response.json({
      client: updatedClient[0],
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

    console.error("Update client error:", error);

    return Response.json(
      {
        error: "Não foi possível atualizar o cliente.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "clients", "delete")) {
      return Response.json(
        { error: "Você não tem permissão para excluir clientes." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const organizationId = currentUser.organization.id;

    const result = await sql`
      UPDATE clients
      SET status = 'inactive'
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      RETURNING id
    `;

    if (result.length === 0) {
      return Response.json(
        { error: "Cliente não encontrado." },
        { status: 404 }
      );
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "UNAUTHENTICATED"
    ) {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Delete client error:", error);

    return Response.json(
      { error: "Não foi possível excluir o cliente." },
      { status: 500 }
    );
  }
}
