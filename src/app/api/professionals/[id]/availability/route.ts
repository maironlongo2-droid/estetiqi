import { hasPermission } from "@/lib/auth/authorization";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { sql } from "@/lib/db/client";
import { availabilitySchema } from "@/lib/validation/professional";

async function authorizeProfessional(id: string, organizationId: string) {
  const result = await sql`
    SELECT id
    FROM professionals
    WHERE id = ${id}
      AND organization_id = ${organizationId}
    LIMIT 1
  `;
  return result.length > 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await params;
    const organizationId = currentUser.organization.id;
    if (!(await authorizeProfessional(id, organizationId))) {
      return Response.json({ error: "PROFESSIONAL_NOT_FOUND" }, { status: 404 });
    }

    const [weekly, exceptions] = await Promise.all([
      sql`
        SELECT id, weekday, starts_at, ends_at
        FROM professional_weekly_availability
        WHERE professional_id = ${id}
          AND organization_id = ${organizationId}
        ORDER BY weekday, starts_at
      `,
      sql`
        SELECT id, exception_date, kind, starts_at, ends_at, reason
        FROM professional_availability_exceptions
        WHERE professional_id = ${id}
          AND organization_id = ${organizationId}
          AND exception_date >= CURRENT_DATE
        ORDER BY exception_date, starts_at NULLS FIRST
      `,
    ]);

    return Response.json({ weekly, exceptions });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Get professional availability error:", error);
    return Response.json({ error: "Não foi possível carregar a disponibilidade." }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await params;
    const organizationId = currentUser.organization.id;
    if (!(await authorizeProfessional(id, organizationId))) {
      return Response.json({ error: "PROFESSIONAL_NOT_FOUND" }, { status: 404 });
    }

    const parsed = availabilitySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "INVALID_DATA", details: parsed.error.flatten() }, { status: 400 });
    }

    const weekly = parsed.data.weekly;
    const exceptions = parsed.data.exceptions;
    const statements = [
      sql`
        DELETE FROM professional_weekly_availability
        WHERE professional_id = ${id}
          AND organization_id = ${organizationId}
      `,
      sql`
        DELETE FROM professional_availability_exceptions
        WHERE professional_id = ${id}
          AND organization_id = ${organizationId}
          AND exception_date >= CURRENT_DATE
      `,
    ];

    for (const interval of weekly) {
      statements.push(sql`
        INSERT INTO professional_weekly_availability (
          organization_id,
          professional_id,
          weekday,
          starts_at,
          ends_at
        )
        VALUES (
          ${organizationId},
          ${id},
          ${interval.weekday},
          ${interval.startsAt},
          ${interval.endsAt}
        )
      `);
    }

    for (const exception of exceptions) {
      statements.push(sql`
        INSERT INTO professional_availability_exceptions (
          organization_id,
          professional_id,
          exception_date,
          kind,
          starts_at,
          ends_at,
          reason
        )
        VALUES (
          ${organizationId},
          ${id},
          ${exception.date},
          ${exception.kind},
          ${exception.startsAt ?? null},
          ${exception.endsAt ?? null},
          ${exception.reason || null}
        )
      `);
    }

    await sql.transaction(statements);
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Save professional availability error:", error);
    return Response.json({
      error: "Não foi possível salvar a disponibilidade.",
    }, { status: 500 });
  }
}
