import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { getAvailableAppointmentSlots } from "@/lib/appointments/availability";
import { resolveBookableSelection } from "@/lib/appointments/bookable";

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
    const selection = await resolveBookableSelection({
      organizationId,
      professionalId,
      procedureIds,
    });

    if (!selection.ok) {
      if (selection.code === "PROCEDURE_DURATION_REQUIRED") {
        return Response.json(
          { error: "PROCEDURE_DURATION_REQUIRED", slots: [] },
          { status: selection.status }
        );
      }
      return Response.json(
        { error: selection.code },
        { status: selection.status }
      );
    }

    // A agenda tem de reservar a soma das durações de todos os procedimentos.
    const durationMinutes = selection.durationMinutes;

    const slots = await getAvailableAppointmentSlots({
      organizationId,
      professionalId,
      date,
      durationMinutes,
    });
    return Response.json({ slots, durationMinutes });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Get appointment availability error:", error);
    return Response.json({ error: "Não foi possível consultar horários disponíveis." }, { status: 500 });
  }
}

