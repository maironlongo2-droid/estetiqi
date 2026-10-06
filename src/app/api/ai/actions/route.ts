import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { createAIAction } from "@/lib/ai/actions";

const schema = z.object({
  opportunityId: z.string().uuid(),
  type: z.string().trim().min(1).max(60),
  clientId: z.string().uuid().optional().nullable(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

  if (!hasPermission(currentUser.role, "intelligence", "read")) {
    return Response.json(
      { error: "Você não tem permissão para visualizar ações de inteligência." },
      { status: 403 }
    );
  }

  const result = await sql`
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
    WHERE organization_id = ${currentUser.organization.id}
    ORDER BY created_at DESC
    LIMIT 50
  `;

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("AI actions GET error:", error);
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

  if (!hasPermission(currentUser.role, "intelligence", "create")) {
    return Response.json(
      { error: "Você não tem permissão para criar ações de inteligência." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_DATA" },
      { status: 400 }
    );
  }

  const opportunity = await sql`
    SELECT
      id,
      client_id,
      type,
      title,
      description,
      priority,
      data
    FROM ai_opportunities
    WHERE id = ${parsed.data.opportunityId}
      AND organization_id = ${currentUser.organization.id}
      AND status = 'open'
    LIMIT 1
  `;

  if (opportunity.length === 0) {
    return Response.json(
      { error: "OPPORTUNITY_NOT_FOUND" },
      { status: 404 }
    );
  }

  const action = await createAIAction({
    organizationId: currentUser.organization.id,
    opportunityId: opportunity[0].id,
    clientId: parsed.data.clientId ?? opportunity[0].client_id,
    type: parsed.data.type,
    payload: {
      opportunity: opportunity[0],
      ...(parsed.data.payload ?? {}),
    },
  });

    return Response.json(action, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("AI actions POST error:", error);
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}
