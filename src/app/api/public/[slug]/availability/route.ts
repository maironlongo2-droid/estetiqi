import { z } from "zod";
import { getPublishedOrganizationBySlug } from "@/lib/public/profile";
import { getAvailableAppointmentSlots } from "@/lib/appointments/availability";
import { resolveBookableSelection } from "@/lib/appointments/bookable";
import { clientIpFromRequest, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const uuidSchema = z.string().uuid();

// Aceita vários procedimentos (?procedureIds=id1,id2).
function parseProcedureIds(params: URLSearchParams) {
  const listParam = params.get("procedureIds");
  const raw = listParam ? listParam.split(",") : [];

  return Array.from(
    new Set(raw.map((value) => value.trim()).filter(Boolean))
  );
}

// Horários realmente disponíveis, calculados com as mesmas regras da agenda
// autenticada. A organização é resolvida no servidor pelo slug: nunca se
// confia em organization_id, preço, duração ou disponibilidade do navegador.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const limit = rateLimit(`public:availability:${clientIpFromRequest(request)}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      return Response.json(
        { error: "Muitas consultas. Tente novamente em instantes." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        }
      );
    }

    const organization = await getPublishedOrganizationBySlug(slug);
    if (!organization) {
      return Response.json({ error: "Cartão não encontrado." }, { status: 404 });
    }

    const ok = new URL(request.url).searchParams;
    const professionalId = ok.get("professionalId");
    const date = ok.get("date");
    const procedureIds = parseProcedureIds(ok);

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
      return Response.json(
        { error: "Parâmetros de consulta inválidos." },
        { status: 400 }
      );
    }

    const selection = await resolveBookableSelection({
      organizationId: organization.id,
      professionalId,
      procedureIds,
    });

    if (!selection.ok) {
      const messages: Record<typeof selection.code, string> = {
        PROFESSIONAL_OR_PROCEDURE_NOT_FOUND:
          "Profissional ou procedimento indisponível.",
        PROCEDURE_NOT_ASSIGNED:
          "O profissional selecionado não realiza um dos procedimentos escolhidos.",
        PROCEDURE_DURATION_REQUIRED:
          "Um dos procedimentos selecionados não tem duração definida.",
      };
      return Response.json(
        { error: messages[selection.code] },
        { status: selection.status }
      );
    }

    const now = Date.now();
    const slots = (
      await getAvailableAppointmentSlots({
        organizationId: organization.id,
        professionalId,
        date,
        durationMinutes: selection.durationMinutes,
      })
    ).filter((slot) => new Date(slot.startsAt).getTime() > now);

    return Response.json({ slots, durationMinutes: selection.durationMinutes });
  } catch (error) {
    console.error("Get public availability error:", error);
    return Response.json(
      { error: "Não foi possível consultar horários disponíveis." },
      { status: 500 }
    );
  }
}
