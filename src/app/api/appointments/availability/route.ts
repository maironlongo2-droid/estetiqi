import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { sql } from "@/lib/db/client";
import { getAvailableAppointmentSlots } from "@/lib/appointments/availability";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidSchema = z.string().uuid();

export async function GET(request: Request) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "create")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const params = new URL(request.url).searchParams;
    const professionalId = params.get("professionalId");
    const procedureId = params.get("procedureId");
    const date = params.get("date");

    if (
      !professionalId ||
      !procedureId ||
      !date ||
      !uuidSchema.safeParse(professionalId).success ||
      !uuidSchema.safeParse(procedureId).success ||
      !datePattern.test(date) ||
      Number.isNaN(Date.parse(`${date}T12:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
    ) {
      return Response.json({ error: "INVALID_AVAILABILITY_QUERY" }, { status: 400 });
    }

    const organizationId = currentUser.organization.id;
    const [professional, procedure, assignment] = await Promise.all([
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
        WHERE id = ${procedureId}
          AND organization_id = ${organizationId}
          AND status = 'active'
        LIMIT 1
      `,
      sql`
        SELECT 1
        FROM professional_procedures
        WHERE organization_id = ${organizationId}
          AND professional_id = ${professionalId}
          AND procedure_id = ${procedureId}
        LIMIT 1
      `,
    ]);

    if (!professional.length || !procedure.length) {
      return Response.json({ error: "PROFESSIONAL_OR_PROCEDURE_NOT_FOUND" }, { status: 404 });
    }
    if (!assignment.length) {
      return Response.json({ error: "PROCEDURE_NOT_ASSIGNED" }, { status: 409 });
    }
    const durationMinutes = procedure[0].duration_minutes;
    if (!durationMinutes) {
      return Response.json(
        { error: "PROCEDURE_DURATION_REQUIRED", slots: [] },
        { status: 409 }
      );
    }

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
