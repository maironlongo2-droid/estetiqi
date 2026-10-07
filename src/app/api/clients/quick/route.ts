import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";

const quickClientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

  if (!hasPermission(currentUser.role, "clients", "create")) {
    return Response.json(
      { error: "Você não tem permissão para criar clientes." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const parsed = quickClientSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_DATA", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { name, phone } = parsed.data;
  const organizationId = currentUser.organization.id;

  const existing = await sql`
    SELECT id, name, phone, status
    FROM clients
    WHERE organization_id = ${organizationId}
      AND LOWER(name) = LOWER(${name})
      AND (
        ${phone || null}::text IS NULL
        OR phone = ${phone}
      )
    LIMIT 1
  `;

  if (existing.length > 0) {
    if (existing[0].status !== "active") {
      return Response.json(
        { error: "Cliente inativo não pode ser selecionado para um novo agendamento." },
        { status: 409 }
      );
    }

    return Response.json(existing[0]);
  }

  const result = await sql`
    INSERT INTO clients (
      organization_id,
      name,
      phone,
      status,
      source
    )
    VALUES (
      ${organizationId},
      ${name},
      ${phone || null},
      'active',
      'agenda'
    )
    RETURNING id, name, phone, status
  `;

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Clients quick error:", error);
    return Response.json({ error: "Erro interno." }, { status: 500 });
  }
}
