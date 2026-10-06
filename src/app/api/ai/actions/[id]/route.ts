import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { executeAIAction } from "@/lib/ai/execute-action";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

  if (!hasPermission(currentUser.role, "intelligence", "update")) {
    return Response.json(
      { error: "Você não tem permissão para aprovar ou cancelar ações de inteligência." },
      { status: 403 }
    );
  }

  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const requestedStatus = body?.status;

  if (!["approved", "cancelled"].includes(requestedStatus)) {
    return Response.json(
      { error: "INVALID_STATUS" },
      { status: 400 }
    );
  }

  const result = await sql`
    UPDATE ai_actions
    SET
      status = ${requestedStatus},
      approved_at = CASE
        WHEN ${requestedStatus} = 'approved' THEN NOW()
        ELSE approved_at
      END,
      updated_at = NOW()
    WHERE id = ${id}
      AND organization_id = ${currentUser.organization.id}
      AND status = 'pending_approval'
    RETURNING
      id,
      opportunity_id,
      client_id,
      type,
      status,
      payload,
      result,
      approved_at,
      executed_at,
      created_at,
      updated_at
  `;

  if (result.length === 0) {
    return Response.json(
      { error: "ACTION_NOT_FOUND_OR_ALREADY_PROCESSED" },
      { status: 404 }
    );
  }

  const action = result[0];

  if (requestedStatus === "approved") {
    try {
      await executeAIAction(
        action.id,
        currentUser.organization.id
      );
    } catch {
      const failed = await sql`
        SELECT
          id,
          opportunity_id,
          client_id,
          type,
          status,
          payload,
          result,
          approved_at,
          executed_at,
          created_at,
          updated_at
        FROM ai_actions
        WHERE id = ${action.id}
          AND organization_id = ${currentUser.organization.id}
        LIMIT 1
      `;

      return Response.json(failed[0], { status: 200 });
    }

    const completed = await sql`
      SELECT
        id,
        opportunity_id,
        client_id,
        type,
        status,
        payload,
        result,
        approved_at,
        executed_at,
        created_at,
        updated_at
      FROM ai_actions
      WHERE id = ${action.id}
        AND organization_id = ${currentUser.organization.id}
      LIMIT 1
    `;

    return Response.json(completed[0]);
  }

    return Response.json(action);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("AI action PATCH error:", error);
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}
