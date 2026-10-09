import { hasPermission } from "@/lib/auth/authorization";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { sql } from "@/lib/db/client";
import { updateProfessionalSchema } from "@/lib/validation/professional";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await params;
    const parsed = updateProfessionalSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "INVALID_DATA", details: parsed.error.flatten() }, { status: 400 });
    }

    const { name, phone, email, specialty, active, procedureIds } = parsed.data;
    const organizationId = currentUser.organization.id;

    if (procedureIds) {
      const procedures = await sql`
        SELECT id
        FROM procedures
        WHERE organization_id = ${organizationId}
          AND status = 'active'
          AND id = ANY(${procedureIds}::uuid[])
      `;
      if (procedures.length !== procedureIds.length) {
        return Response.json({ error: "PROCEDURE_NOT_FOUND" }, { status: 404 });
      }
    }

    const current = await sql`
      SELECT id
      FROM professionals
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;
    if (current.length === 0) {
      return Response.json({ error: "PROFESSIONAL_NOT_FOUND" }, { status: 404 });
    }

    const statements = [
      sql`
        UPDATE professionals
        SET
          name = COALESCE(${name ?? null}, name),
          phone = CASE WHEN ${phone !== undefined} THEN ${phone || null} ELSE phone END,
          email = CASE WHEN ${email !== undefined} THEN ${email || null} ELSE email END,
          specialty = CASE WHEN ${specialty !== undefined} THEN ${specialty || null} ELSE specialty END,
          active = COALESCE(${active ?? null}, active),
          updated_at = NOW()
        WHERE id = ${id}
          AND organization_id = ${organizationId}
        RETURNING id, name, phone, email, specialty, active, created_at, updated_at
      `,
    ];

    if (procedureIds !== undefined) {
      statements.push(sql`
        DELETE FROM professional_procedures
        WHERE professional_id = ${id}
          AND organization_id = ${organizationId}
      `);
      if (procedureIds.length > 0) {
        statements.push(sql`
          INSERT INTO professional_procedures (
            organization_id,
            professional_id,
            procedure_id
          )
          SELECT ${organizationId}, ${id}, procedure_id
          FROM UNNEST(${procedureIds}::uuid[]) AS selected(procedure_id)
        `);
      }
    }

    const results = await sql.transaction(statements);
    return Response.json({
      ...results[0][0],
      procedure_ids: procedureIds,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Update professional error:", error);
    return Response.json({ error: "Não foi possível atualizar profissional." }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "delete")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await params;
    const organizationId = currentUser.organization.id;
    const deleted = await sql`
      DELETE FROM professionals professional
      WHERE professional.id = ${id}
        AND professional.organization_id = ${organizationId}
        AND professional.active = FALSE
        AND NOT EXISTS (
          SELECT 1
          FROM appointments appointment
          WHERE appointment.organization_id = professional.organization_id
            AND (
              appointment.professional_id = professional.id
              OR (
                appointment.professional_id IS NULL
                AND appointment.professional_name = professional.name
              )
            )
        )
      RETURNING professional.id
    `;

    if (deleted.length > 0) {
      return Response.json({ success: true });
    }

    const professional = await sql`
      SELECT id, active
      FROM professionals
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;
    if (professional.length === 0) {
      return Response.json({ error: "PROFESSIONAL_NOT_FOUND" }, { status: 404 });
    }
    if (professional[0].active) {
      return Response.json(
        { error: "Inative a profissional antes de excluí-la permanentemente." },
        { status: 409 }
      );
    }

    return Response.json(
      {
        error: "Não é possível excluir este cadastro porque há atendimentos relacionados. Ele permanece inativo para preservar o histórico.",
      },
      { status: 409 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Delete professional error:", error);
    return Response.json({ error: "Não foi possível excluir profissional." }, { status: 500 });
  }
}
