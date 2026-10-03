import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { analyzeBusiness } from "@/lib/ai/business-analysis";

export async function GET() {
  const currentUser = await requireCurrentUser();

  const result = await sql`
    SELECT
      id,
      type,
      title,
      description,
      priority,
      status,
      data,
      created_at,
      updated_at
    FROM ai_opportunities
    WHERE organization_id = ${currentUser.organization.id}
      AND status = 'open'
    ORDER BY
      CASE priority
        WHEN 'high' THEN 1
        WHEN 'medium' THEN 2
        ELSE 3
      END,
      created_at DESC
    LIMIT 20
  `;

  return Response.json(result);
}

export async function POST() {
  const currentUser = await requireCurrentUser();

  const result = await analyzeBusiness(
    currentUser.organization.id
  );

  return Response.json(result);
}
