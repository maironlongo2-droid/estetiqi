import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";

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
    const body = await request.json();

    if (typeof body.active !== "boolean") {
      return Response.json({ error: "INVALID_DATA" }, { status: 400 });
    }

    const result = await sql`
    UPDATE automations
    SET
      active = ${body.active},
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
