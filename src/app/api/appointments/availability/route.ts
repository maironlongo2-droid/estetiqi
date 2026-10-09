import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { getAvailableAppointmentSlots } from "@/lib/appointments/availability";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidSchema = z.string().uuid();

// Aceita vários procedimentos (?procedureIds=id1,id2) mantendo compatibilidade
// com o parâmetro único antigo (?procedureId=id1).
function parseProcedureIds(params: URLSearchParams) {
  const listParam = params.get("procedureIds");
  const raw = listParam
    ? listParam.split(",")
    : params.get("procedureId")
      ? [params.get("procedureId") as string]
      : [];

  return Array.from(
    new Set(raw.map((value) => value.trim()).filter(Boolean))
  );
}

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "create")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const professionalId = params.get("professionalId");
    const date = params.get("date");
    const procedureIds = parseProcedureIds(params);

    if (
      !professionalId ||
      procedureIds.length === 0 ||
      !date ||
      !uuidSchema.safeParse(professionalId).success ||
      !procedureIds.every((id) => uuidSchema.safeParse(id).success) ||
      !datePattern.test(date) ||
      Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    ) {
      return Response.json({ error: "INVALID_AVAILABILITY_QUERY" }, { status: 400 });
    }

    const organizationId = currentUser.organization.id;
    const [professional, procedures, assignments] = await Promise.all([
      sql`
        SELECT id
        FROM professionals
        WHERE id = ${professionalId}
          AND organization_id = ${organizationId}
          AND active = TRUE
        LIMIT 1
      `,
      sql`
        SELECT id, duration_minutes
        FROM procedures
        WHERE organization_id = ${organizationId}
          AND status = 'active'
          AND id = ANY(${procedureIds}::uuid[])
      `,
      sql`
        SELECT procedure_id
        FROM professional_procedures
        WHERE organization_id = ${organizationId}
          AND professional_id = ${professionalId}
          AND procedure_id = ANY(${procedureIds}::uuid[])
      `,
    ]);

    if (!professional.length || procedures.length !== procedureIds.length) {
      return Response.json({ error: "PROFESSIONAL_OR_PROCEDURE_NOT_FOUND" }, { status: 404 });
    }
    if (assignments.length !== procedureIds.length) {
      return Response.json({ error: "PROCEDURE_NOT_ASSIGNED" }, { status: 409 });
    }

    // A agenda tem de reservar a soma das durações de todos os procedimentos.
    const hasEveryDuration = procedures.every(
      (procedure) => typeof procedure.duration_minutes === "number" && procedure.duration_minutes > 0
    );
    if (!hasEveryDuration) {
      return Response.json(
        { error: "PROCEDURE_DURATION_REQUIRED", slots: [] },
        { status: 409 }
      );
    }

    const durationMinutes = procedures.reduce(
      (total, procedure) => total + procedure.duration_minutes,
      0
    );

    const slots = await getAvailableAppointmentSlots({
      organizationId,
      professionalId,
      date,
      durationMinutes,
    });
    return Response.json({ slots, durationMinutes });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Get appointment availability error:", error);
    return Response.json({ error: "Não foi possível consultar horários disponíveis." }, { status: 500 });
  }
}

