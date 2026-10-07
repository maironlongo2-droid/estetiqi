import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import {
  normalizeCpf,
  normalizePhone,
} from "@/lib/normalization/brazil";
import { PERMANENTLY_DELETED_SOURCE } from "@/lib/clients/constants";
import { updateClientSchema } from "@/lib/validation/client";
import { withTransaction } from "@/lib/db/transaction";

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
        AND source IS DISTINCT FROM ${PERMANENTLY_DELETED_SOURCE}
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

    if (result.data.source === PERMANENTLY_DELETED_SOURCE) {
      return Response.json(
        { error: "Origem reservada." },
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
        AND source IS DISTINCT FROM ${PERMANENTLY_DELETED_SOURCE}
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
        phone = CASE WHEN ${phone !== undefined}
          THEN ${normalizedPhone ?? null}
          ELSE phone
        END,
        email = CASE WHEN ${email !== undefined}
          THEN ${normalizedEmail ?? null}
          ELSE email
        END,
        cpf = CASE WHEN ${cpf !== undefined}
          THEN ${normalizedCpf ?? null}
          ELSE cpf
        END,
        birth_date = CASE WHEN ${birthDate !== undefined}
          THEN ${birthDate || null}::date
          ELSE birth_date
        END,
        notes = CASE WHEN ${notes !== undefined}
          THEN ${notes || null}
          ELSE notes
        END,
        source = CASE WHEN ${source !== undefined}
          THEN ${source || null}
          ELSE source
        END,
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

    const body = await request.json().catch(() => null);

    if (body?.confirmation !== "DELETE_PERMANENTLY") {
      return Response.json(
        { error: "Confirmação explícita necessária." },
        { status: 400 }
      );
    }

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `SELECT id
         FROM clients
         WHERE id = $1
           AND organization_id = $2
           AND source IS DISTINCT FROM $3
         FOR UPDATE`,
        [id, organizationId, PERMANENTLY_DELETED_SOURCE]
      );

      if (existing.rows.length === 0) {
        return false;
      }

      await client.query(
        `UPDATE appointments
         SET notes = NULL
         WHERE client_id = $1 AND organization_id = $2`,
        [id, organizationId]
      );

      await client.query(
        `UPDATE payments
         SET notes = NULL
         WHERE client_id = $1 AND organization_id = $2`,
        [id, organizationId]
      );

      await client.query(
        `UPDATE customer_events
         SET data = '{}'::jsonb
         WHERE client_id = $1 AND organization_id = $2`,
        [id, organizationId]
      );

      await client.query(
        `UPDATE ai_opportunities
         SET title = 'Oportunidade de cliente removido',
             description = 'Dados pessoais removidos permanentemente.',
             data = '{}'::jsonb,
             status = 'dismissed',
             updated_at = NOW()
         WHERE client_id = $1 AND organization_id = $2`,
        [id, organizationId]
      );

      await client.query(
        `UPDATE ai_actions
         SET payload = '{}'::jsonb,
             result = NULL,
             status = CASE
               WHEN status IN ('pending_approval', 'approved', 'running')
                 THEN 'cancelled'
               ELSE status
             END,
             updated_at = NOW()
         WHERE organization_id = $2
           AND (
             client_id = $1
             OR opportunity_id IN (
               SELECT id
               FROM ai_opportunities
               WHERE client_id = $1 AND organization_id = $2
             )
           )`,
        [id, organizationId]
      );

      await client.query(
        `UPDATE clients
         SET name = 'Cliente removido',
             phone = NULL,
             email = NULL,
             cpf = NULL,
             birth_date = NULL,
             notes = NULL,
             source = $3,
             status = 'inactive',
             updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [id, organizationId, PERMANENTLY_DELETED_SOURCE]
      );

      return true;
    });

    if (!result) {
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
