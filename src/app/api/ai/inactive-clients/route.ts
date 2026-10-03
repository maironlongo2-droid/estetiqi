import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { analyzeInactiveClients } from "@/lib/ai/engine";

const requestSchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(60),
});

export async function GET(request: Request) {
  const currentUser = await requireCurrentUser();

  const url = new URL(request.url);

  const parsed = requestSchema.safeParse({
    days: url.searchParams.get("days") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: "INVALID_DATA" }, { status: 400 });
  }

  const days = parsed.data.days;

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
      phone: client.phone,
      email: client.email,
      last_appointment_at: client.last_appointment_at,
      inactive_days: client.inactive_days,
    })),
    days
  );

  return Response.json({
    count: clients.length,
    clients,
    analysis,
  });
}
