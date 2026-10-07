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

    if (!["approved", "cancelled", "execute"].includes(requestedStatus)) {
      return Response.json({ error: "INVALID_STATUS" }, { status: 400 });
    }

    if (requestedStatus === "execute") {
      const approvedAction = await sql`
        SELECT id
        FROM ai_actions
        WHERE id = ${id}
          AND organization_id = ${currentUser.organization.id}
          AND status = 'approved'
        LIMIT 1
      `;
      if (!approvedAction.length) {
        const actionExists = await sql`
          SELECT id
          FROM ai_actions
          WHERE id = ${id}
            AND organization_id = ${currentUser.organization.id}
          LIMIT 1
        `;
        return Response.json(
          { error: actionExists.length ? "ACTION_NOT_APPROVED" : "ACTION_NOT_FOUND" },
          { status: actionExists.length ? 409 : 404 }
        );
      }

      try {
        await executeAIAction(id, currentUser.organization.id);
      } catch (error) {
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
          WHERE id = ${id}
            AND organization_id = ${currentUser.organization.id}
          LIMIT 1
        `;

        if (!failed.length) {
          return Response.json({ error: "ACTION_NOT_FOUND" }, { status: 404 });
        }

        console.error("AI action execution failed:", error);
        return Response.json(
          { error: "Não foi possível executar a ação.", action: failed[0] },
          { status: 502 }
        );
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
        WHERE id = ${id}
          AND organization_id = ${currentUser.organization.id}
        LIMIT 1
      `;
      return Response.json(completed[0]);
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

    if (!result.length) {
      return Response.json(
        { error: "ACTION_NOT_FOUND_OR_ALREADY_PROCESSED" },
        { status: 404 }
      );
    }

    return Response.json(result[0]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("AI action PATCH error:", error);
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}
