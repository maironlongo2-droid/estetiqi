import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";

const automationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(["inactive_client", "birthday", "procedure_return"]),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  config: z.record(z.string(), z.any()).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "intelligence", "read")) {
      throw new Error("FORBIDDEN");
    }

    const result = await sql`
    SELECT
      id,
      name,
      type,
      description,
      active,
      config,
      created_at,
      updated_at
    FROM automations
    WHERE organization_id = ${currentUser.organization.id}
    ORDER BY created_at DESC
  `;

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    console.error("List automations error:", error);

    return Response.json(
      { error: "Não foi possível listar as automações." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "intelligence", "create")) {
      throw new Error("FORBIDDEN");
    }

    const body = await request.json();
    const parsed = automationSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "INVALID_DATA", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await sql`
    INSERT INTO automations (
      organization_id,
      name,
      type,
      description,
      active,
      config
    )
    VALUES (
      ${currentUser.organization.id},
      ${parsed.data.name},
      ${parsed.data.type},
      ${parsed.data.description || null},
      ${parsed.data.active ?? true},
      ${JSON.stringify(parsed.data.config ?? {})}::jsonb
    )
    RETURNING
      id,
      name,
      type,
      description,
      active,
      config,
      created_at,
      updated_at
  `;

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    console.error("Create automation error:", error);

    return Response.json(
      { error: "Não foi possível criar a automação." },
      { status: 500 },
    );
  }
}
