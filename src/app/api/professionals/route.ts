import { hasPermission } from "@/lib/auth/authorization";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { sql } from "@/lib/db/client";
import { professionalSchema } from "@/lib/validation/professional";

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const professionals = await sql`
      SELECT
        p.id,
        p.name,
        p.phone,
        p.email,
        p.active,
        p.created_at,
        p.updated_at,
        (p.photo_image IS NOT NULL) AS has_photo,
        p.photo_updated_at,
        COALESCE(
          ARRAY_AGG(active_procedure.id)
            FILTER (WHERE active_procedure.id IS NOT NULL),
          ARRAY[]::uuid[]
        ) AS procedure_ids,
        COALESCE((
          SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
            'id', availability.id,
            'weekday', availability.weekday,
            'starts_at', availability.starts_at,
            'ends_at', availability.ends_at
          ) ORDER BY availability.weekday, availability.starts_at)
          FROM professional_weekly_availability availability
          WHERE availability.professional_id = p.id
            AND availability.organization_id = p.organization_id
        ), '[]'::jsonb) AS weekly,
        COALESCE((
          SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
            'id', exception.id,
            'exception_date', exception.exception_date,
            'kind', exception.kind,
            'starts_at', exception.starts_at,
            'ends_at', exception.ends_at,
            'reason', exception.reason
          ) ORDER BY exception.exception_date, exception.starts_at NULLS FIRST)
          FROM professional_availability_exceptions exception
          WHERE exception.professional_id = p.id
            AND exception.organization_id = p.organization_id
        ), '[]'::jsonb) AS exceptions
      FROM professionals p
      LEFT JOIN professional_procedures pp
        ON pp.professional_id = p.id
        AND pp.organization_id = p.organization_id
      LEFT JOIN procedures active_procedure
        ON active_procedure.id = pp.procedure_id
        AND active_procedure.organization_id = pp.organization_id
        AND active_procedure.status = 'active'
      WHERE p.organization_id = ${currentUser.organization.id}
      GROUP BY p.id
      ORDER BY p.active DESC, p.name
    `;

    return Response.json(professionals);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("List professionals error:", error);
    return Response.json({ error: "Não foi possível listar profissionais." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "create")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const parsed = professionalSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "INVALID_DATA", details: parsed.error.flatten() }, { status: 400 });
    }

    const { name, phone, email, procedureIds = [], active = true } = parsed.data;
    const organizationId = currentUser.organization.id;

    if (procedureIds.length > 0) {
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

    const results = await sql`
      WITH created AS (
        INSERT INTO professionals (organization_id, name, phone, email, active)
        VALUES (
          ${organizationId},
          ${name},
          ${phone || null},
          ${email || null},
          ${active}
        )
        RETURNING id, name, phone, email, active, created_at, updated_at
      ),
      assigned AS (
        INSERT INTO professional_procedures (
          organization_id,
          professional_id,
          procedure_id
        )
        SELECT ${organizationId}, created.id, procedure_id
        FROM created
        CROSS JOIN UNNEST(${procedureIds}::uuid[]) AS selected(procedure_id)
        RETURNING professional_id
      )
      SELECT created.*
      FROM created
      LEFT JOIN (SELECT COUNT(*) FROM assigned) assignment_count ON TRUE
    `;
    return Response.json(
      {
        ...results[0],
        procedure_ids: procedureIds,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Create professional error:", error);
    return Response.json({ error: "Não foi possível cadastrar profissional." }, { status: 500 });
  }
}
