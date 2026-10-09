import { z } from "zod";
import { getPublishedOrganizationBySlug } from "@/lib/public/profile";
import { getAvailableDatesInMonth } from "@/lib/appointments/availability";
import { resolveBookableSelection } from "@/lib/appointments/bookable";
import { clientIpFromRequest, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
const uuidSchema = z.string().uuid();

// Aceita vários procedimentos (?procedureIds=id1,id2).
function parseProcedureIds(params: URLSearchParams) {
  const listParam = params.get("procedureIds");
  const raw = listParam ? listParam.split(",") : [];

  return Array.from(
    new Set(raw.map((value) => value.trim()).filter(Boolean))
  );
}

// Dias do mês em que há pelo menos um horário livre para a combinação escolhida
// (profissional + procedimentos). A página pública usa isso para deixar em cinza
// e desabilitar os dias sem disponibilidade real; o servidor continua sendo a
// fonte da verdade, recalculando as mesmas regras de agenda.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const limit = rateLimit(
      `public:availability-month:${clientIpFromRequest(request)}`,
      { limit: 120, windowMs: 60_000 }
    );
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
    const month = ok.get("month");
    const procedureIds = parseProcedureIds(ok);

    if (
      !professionalId ||
      !uuidSchema.safeParse(professionalId).success ||
      procedureIds.length === 0 ||
      !procedureIds.every((id) => uuidSchema.safeParse(id).success) ||
      !month ||
      !monthPattern.test(month)
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

    const dates = await getAvailableDatesInMonth({
      organizationId: organization.id,
      professionalId,
      month,
      durationMinutes: selection.durationMinutes,
    });

    return Response.json({ dates });
  } catch (error) {
    console.error("Get public month availability error:", error);
    return Response.json(
      { error: "Não foi possível consultar a disponibilidade." },
      { status: 500 }
    );
  }
}
