import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { z } from "zod";

const updateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    type: z.enum(["inactive_client", "birthday", "procedure_return"]).optional(),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    active: z.boolean().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "intelligence", "update")) {
      throw new Error("FORBIDDEN");
    }
    const { id } = await params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "INVALID_DATA" }, { status: 400 });
    }

    const result = await sql`
    UPDATE automations
    SET
      name = COALESCE(${parsed.data.name ?? null}, name),
      type = COALESCE(${parsed.data.type ?? null}, type),
      description = CASE
        WHEN ${parsed.data.description !== undefined}
        THEN ${parsed.data.description || null}
        ELSE description
      END,
      active = COALESCE(${parsed.data.active ?? null}, active),
      config = COALESCE(${parsed.data.config ? JSON.stringify(parsed.data.config) : null}::jsonb, config),
      updated_at = NOW()
    WHERE id = ${id}
      AND organization_id = ${currentUser.organization.id}
    RETURNING
      id,
      name,
      type,
      description,
      active,
      config
  `;

    if (result.length === 0) {
      return Response.json({ error: "AUTOMATION_NOT_FOUND" }, { status: 404 });
    }

    return Response.json(result[0]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error instanceof Error && error.message === "FORBIDDEN") {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    console.error("Update automation error:", error);

    return Response.json(
      { error: "Não foi possível atualizar a automação." },
      { status: 500 },
    );
  }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    try {
      const currentUser = await requireCurrentUser();
      if (!hasPermission(currentUser.role, "intelligence", "delete")) {
        return Response.json({ error: "Sem permissão." }, { status: 403 });
      }
      const { id } = await params;
      const result = await sql`
        DELETE FROM automations
        WHERE id = ${id}
          AND organization_id = ${currentUser.organization.id}
        RETURNING id
      `;

      if (result.length === 0) {
        return Response.json({ error: "AUTOMATION_NOT_FOUND" }, { status: 404 });
      }

      return Response.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHENTICATED") {
        return Response.json({ error: "Não autenticado." }, { status: 401 });
      }

      console.error("Delete automation error:", error);
      return Response.json(
        { error: "Não foi possível excluir a automação." },
        { status: 500 },
      );
  }
}
