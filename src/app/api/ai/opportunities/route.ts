import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { PERMANENTLY_DELETED_SOURCE } from "@/lib/clients/constants";
import { analyzeBusiness } from "@/lib/ai/business-analysis";
import {
  createReturnOpportunities,
  getReturnOpportunityCandidates,
} from "@/lib/ai/return-opportunities";

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "intelligence", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const url = new URL(request.url);
    if (url.searchParams.get("type") === "client_return") {
      const result = await getReturnOpportunityCandidates(
        currentUser.organization.id
      );
      return Response.json(result);
    }

    const result = await sql`
    SELECT
      opportunity.id,
      opportunity.client_id,
      client.name AS client_name,
      opportunity.type,
      opportunity.title,
      opportunity.description,
      opportunity.priority,
      opportunity.status,
      opportunity.data,
      opportunity.created_at,
      opportunity.updated_at
    FROM ai_opportunities opportunity
    LEFT JOIN clients client
      ON client.id = opportunity.client_id
      AND client.organization_id = opportunity.organization_id
      AND client.source IS DISTINCT FROM ${PERMANENTLY_DELETED_SOURCE}
    WHERE opportunity.organization_id = ${currentUser.organization.id}
      AND opportunity.status = 'open'
      AND NOT EXISTS (
        SELECT 1
        FROM ai_actions rejected
        WHERE rejected.organization_id = opportunity.organization_id
          AND rejected.status = 'cancelled'
          AND (
            (
              opportunity.type = 'client_return'
              AND rejected.payload->'opportunity'->'data'->>'situationKey' =
                opportunity.data->>'situationKey'
            )
            OR (
              opportunity.type <> 'client_return'
              AND rejected.payload->'opportunity'->>'type' = opportunity.type
              AND rejected.payload->'opportunity'->>'title' = opportunity.title
              AND rejected.payload->'opportunity'->>'description' = opportunity.description
            )
          )
      )
    ORDER BY
      CASE opportunity.priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      opportunity.created_at DESC
    LIMIT 20
  `;

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("List AI opportunities error:", error);

    return Response.json(
      { error: "Não foi possível carregar as oportunidades." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "intelligence", "create")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const body = await request.text();
    if (body.trim()) {
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        return Response.json({ error: "INVALID_DATA" }, { status: 400 });
      }

      if (
        !payload ||
        typeof payload !== "object" ||
        !("type" in payload) ||
        payload.type !== "client_return"
      ) {
        return Response.json({ error: "INVALID_DATA" }, { status: 400 });
      }

      const result = await createReturnOpportunities(
        currentUser.organization.id
      );
      return Response.json(result);
    }

    const result = await analyzeBusiness(currentUser.organization.id);

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Analyze AI opportunities error:", error);

    return Response.json(
      { error: "Não foi possível analisar as oportunidades." },
      { status: 500 },
    );
  }
}
