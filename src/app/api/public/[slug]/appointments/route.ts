import { z } from "zod";
import { sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/pg-errors";
import { getPublishedOrganizationBySlug } from "@/lib/public/profile";
import { normalizePhone } from "@/lib/normalization/brazil";
import { createAppointmentRecord } from "@/lib/appointments/create-appointment";
import { resolveBookableSelection } from "@/lib/appointments/bookable";
import {
  getAvailableAppointmentSlots,
  localDateInSaoPaulo,
} from "@/lib/appointments/availability";
import { clientIpFromRequest, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const bookingSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Informe seu nome completo.")
    .max(120, "Nome muito longo."),
  phone: z
    .string()
    .trim()
    .min(8, "Informe um telefone com DDD.")
    .max(30, "Telefone inválido."),
  procedureIds: z
    .array(z.string().uuid())
    .min(1, "Escolha pelo menos um procedimento.")
    .max(20, "Selecione menos procedimentos."),
  professionalId: z.string().uuid("Profissional inválido."),
  startsAt: z.string().datetime({ message: "Horário inválido." }),
});

type ClientResolution = { clientId: string };

// Reutiliza um cliente existente pelo telefone (normalizado) na mesma
// organização, evitando duplicações. Se o cliente estava inativo, ele volta a
// ficar ativo porque está agendando novamente.
async function findOrCreatePublicClient(input: {
  organizationId: string;
  name: string;
  phone: string;
}): Promise<ClientResolution> {
  const { organizationId, name, phone } = input;

  const existing = await sql`
    SELECT id, status
    FROM clients
    WHERE organization_id = ${organizationId}
      AND phone = ${phone}
    LIMIT 1
  `;

  if (existing.length > 0) {
    const client = existing[0];
    if (client.status !== "active") {
      await sql`
        UPDATE clients
        SET status = 'active', updated_at = NOW()
        WHERE id = ${client.id}
          AND organization_id = ${organizationId}
      `;
    }
    return { clientId: client.id };
  }

  try {
    const created = await sql`
      INSERT INTO clients (organization_id, name, phone, status, source)
      VALUES (${organizationId}, ${name}, ${phone}, 'active', 'publico')
      RETURNING id
    `;
    return { clientId: created[0].id };
  } catch (error) {
    // Corrida: outra requisição criou o mesmo telefone entre o SELECT e o
    // INSERT. Reaproveita o registro existente em vez de falhar.
    if (isUniqueViolation(error)) {
      const retry = await sql`
        SELECT id
        FROM clients
        WHERE organization_id = ${organizationId}
          AND phone = ${phone}
        LIMIT 1
      `;
      if (retry.length > 0) {
        return { clientId: retry[0].id };
      }
    }
    throw error;
  }
}

// Cria um agendamento público. O cliente não precisa de conta. A organização é
// validada no servidor pelo slug e todas as regras de agendamento são
// reutilizadas do motor autenticado.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const limit = rateLimit(`public:booking:${clientIpFromRequest(request)}`, {
      limit: 10,
      windowMs: 10 * 60_000,
    });
    if (!limit.ok) {
      return Response.json(
        { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
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

    const body = await request.json().catch(() => null);
    const parsed = bookingSchema.safeParse(body);
    if (!parsed.success) {
      const firstError =
        Object.values(parsed.error.flatten().fieldErrors).flat()[0] ||
        "Dados inválidos.";
      return Response.json({ error: firstError }, { status: 400 });
    }

    const procedureIds = Array.from(new Set(parsed.data.procedureIds));
    const { professionalId, startsAt } = parsed.data;

    const startDate = new Date(startsAt);
    if (Number.isNaN(startDate.getTime()) || startDate.getTime() <= Date.now()) {
      return Response.json(
        { error: "Escolha um horário no futuro." },
        { status: 400 }
      );
    }

    const phone = normalizePhone(parsed.data.phone);
    if (!phone) {
      return Response.json(
        { error: "Informe um telefone válido com DDD." },
        { status: 400 }
      );
    }

    // Valida a seleção antes de tocar no cadastro de clientes. O servidor
    // recalcula a duração; o horário de término não vem do navegador.
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

    // O horário escolhido precisa ter sido ofertado pelo próprio servidor para
    // esta seleção (mesma data local, profissional e duração total). Assim um
    // visitante anônimo não escreve horários arbitrários na agenda, e a regra
    // não é duplicada: a lista vem da mesma função usada na disponibilidade.
    const offeredSlots = await getAvailableAppointmentSlots({
      organizationId: organization.id,
      professionalId,
      date: localDateInSaoPaulo(startDate),
      durationMinutes: selection.durationMinutes,
    });

    if (!offeredSlots.some((slot) => slot.startsAt === startDate.toISOString())) {
      return Response.json(
        {
          error:
            "Este horário não está mais disponível. Escolha outro horário.",
        },
        { status: 409 }
      );
    }

    const endsAt = new Date(
      startDate.getTime() + selection.durationMinutes * 60_000
    ).toISOString();

    const { clientId } = await findOrCreatePublicClient({
      organizationId: organization.id,
      name: parsed.data.name,
      phone,
    });

    const outcome = await createAppointmentRecord({
      organizationId: organization.id,
      clientId,
      procedureIds,
      professionalId,
      startsAt: startDate.toISOString(),
      endsAt,
      status: "scheduled",
      eventSource: "public",
    });

    if (!outcome.ok) {
      return Response.json(
        { error: outcome.error },
        { status: outcome.status }
      );
    }

    const appointment = outcome.appointment;

    return Response.json(
      {
        appointment: {
          id: appointment.id,
          startsAt: appointment.starts_at,
          endsAt: appointment.ends_at,
          price: appointment.price,
          professionalName: appointment.professional_name,
          status: appointment.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create public appointment error:", error);
    return Response.json(
      { error: "Não foi possível concluir o agendamento. Tente novamente." },
      { status: 500 }
    );
  }
}
