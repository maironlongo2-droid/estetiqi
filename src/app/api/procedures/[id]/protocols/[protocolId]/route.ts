import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import {
  listProcedureProtocols,
  procedureBelongsToOrganization,
} from "@/lib/protocols/protocol-store";
import { updateProtocolSchema } from "@/lib/validation/protocol";

export const dynamic = "force-dynamic";

// Atualização e remoção de um protocolo vigente do procedimento.
// Toda consulta filtra por organização (do usuário autenticado) + procedimento +
// protocolo: um protocolo de outra clínica responde 404, nunca 403 ou 500.

function errorResponse(error: unknown, fallback: string, action: string) {
  if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
    return Response.json(
      { error: "A organização está bloqueada. Fale com o suporte da EstetiQI." },
      { status: 403 }
    );
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }
  console.error(`${action}:`, error);
  return Response.json({ error: fallback }, { status: 500 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; protocolId: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "procedures", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id, protocolId } = await context.params;
    const organizationId = currentUser.organization.id;

    if (!(await procedureBelongsToOrganization(organizationId, id))) {
      return Response.json(
        { error: "Procedimento não encontrado." },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = updateProtocolSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Dados do protocolo inválidos.",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { name, description, protocolKind, autoSend } = parsed.data;

    const updated = (await sql`
      UPDATE procedure_protocols
      SET
        name = COALESCE(${name ?? null}, name),
        description = CASE
          WHEN ${description === undefined} THEN description
          WHEN ${description ?? ""} = '' THEN NULL
          ELSE ${description ?? null}
        END,
        protocol_kind = COALESCE(${protocolKind ?? null}, protocol_kind),
        auto_send = COALESCE(${autoSend ?? null}, auto_send),
        updated_at = NOW()
      WHERE id = ${protocolId}
        AND organization_id = ${organizationId}
        AND procedure_id = ${id}
        AND is_current = TRUE
      RETURNING id
    `) as { id: string }[];

    if (updated.length === 0) {
      return Response.json(
        { error: "Protocolo não encontrado." },
        { status: 404 }
      );
    }

    return Response.json({
      protocols: await listProcedureProtocols(organizationId, id),
    });
  } catch (error) {
    return errorResponse(
      error,
      "Não foi possível atualizar o protocolo.",
      "Update procedure protocol error"
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; protocolId: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "procedures", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id, protocolId } = await context.params;
    const organizationId = currentUser.organization.id;

    if (!(await procedureBelongsToOrganization(organizationId, id))) {
      return Response.json(
        { error: "Procedimento não encontrado." },
        { status: 404 }
      );
    }

    const removed = (await sql`
      DELETE FROM procedure_protocols
      WHERE id = ${protocolId}
        AND organization_id = ${organizationId}
        AND procedure_id = ${id}
      RETURNING id
    `) as { id: string }[];

    if (removed.length === 0) {
      return Response.json(
        { error: "Protocolo não encontrado." },
        { status: 404 }
      );
    }

    return Response.json({
      protocols: await listProcedureProtocols(organizationId, id),
    });
  } catch (error) {
    return errorResponse(
      error,
      "Não foi possível remover o protocolo.",
      "Delete procedure protocol error"
    );
  }
}
