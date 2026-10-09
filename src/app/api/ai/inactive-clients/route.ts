import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { analyzeInactiveClients } from "@/lib/ai/engine";

const requestSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(60),
});

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "intelligence", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const url = new URL(request.url);

    const parsed = requestSchema.safeParse({
      days: url.searchParams.get("days") ?? undefined,
    });

    if (!parsed.success) {
      return Response.json({ error: "INVALID_DATA" }, { status: 400 });
    }

    const days = parsed.data.days;

    // Contexto mínimo do negócio: o tipo de atuação orienta o vocabulário da
    // análise. A organização vem do usuário autenticado (isolamento de tenant).
    const organizationResult = await sql`
      SELECT business_type
      FROM organizations
      WHERE id = ${currentUser.organization.id}
      LIMIT 1
    `;
    const businessType = organizationResult[0]?.business_type ?? null;

    const clients = await sql`
    SELECT
      c.id,
      c.name,
      c.phone,
      c.email,
      MAX(a.starts_at) AS last_appointment_at,
      EXTRACT(
        DAY FROM (NOW() - MAX(a.starts_at))
      )::int AS inactive_days
    FROM clients c
    LEFT JOIN appointments a
      ON a.client_id = c.id
      AND a.organization_id = c.organization_id
      AND a.status = 'completed'
    WHERE c.organization_id = ${currentUser.organization.id}
      AND c.status = 'active'
    GROUP BY c.id, c.name, c.phone, c.email
    HAVING MAX(a.starts_at) IS NOT NULL
      AND MAX(a.starts_at) <= NOW() - (${days} * INTERVAL '1 day')
    ORDER BY last_appointment_at ASC
    LIMIT 50
  `;

    const analysis = await analyzeInactiveClients(
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        last_appointment_at: client.last_appointment_at,
        inactive_days: client.inactive_days,
      })),
      days,
      { businessType },
    );

    return Response.json({
      count: clients.length,
      clients,
      analysis,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Inactive clients analysis error:", error);

    return Response.json(
      { error: "Não foi possível analisar os clientes inativos." },
      { status: 500 },
    );
  }
}
