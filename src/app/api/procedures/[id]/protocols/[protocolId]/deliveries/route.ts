import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { deliverProtocolsForAppointment } from "@/lib/protocols/protocol-delivery";
import {
  listProcedureProtocols,
  procedureBelongsToOrganization,
} from "@/lib/protocols/protocol-store";

export const dynamic = "force-dynamic";

// Nova tentativa de envio de um protocolo para um agendamento específico. Usada
// pelo botão "Tentar novamente" na tela de Procedimentos quando o envio ficou
// indisponível (WhatsApp oficial não conectado) ou falhou.
//
// O envio NÃO é duplicado: o banco mantém um único registro por protocolo +
// agendamento + gatilho; uma nova tentativa atualiza esse mesmo registro. Se ele
// já estiver confirmado como enviado, o envio não é repetido.

const retrySchema = z.object({
  appointmentId: z.string().uuid("Agendamento inválido."),
  trigger: z.enum(["pre_appointment", "post_appointment"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; protocolId: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "procedures", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id, protocolId } = await context.params;
    const organizationId = currentUser.organization.id;

    if (!(await procedureBelongsToOrganization(organizationId, id))) {
      return Response.json(
        { error: "Procedimento não encontrado." },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = retrySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        {
          error: "Dados inválidos.",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const outcome = await deliverProtocolsForAppointment({
      organizationId,
      appointmentId: parsed.data.appointmentId,
      trigger: parsed.data.trigger,
      protocolId,
    });

    if (outcome.status === "schema_pending") {
      return Response.json({ error: outcome.detail }, { status: 503 });
    }

    return Response.json({
      outcome,
      protocols: await listProcedureProtocols(organizationId, id),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json(
        {
          error:
            "A organização está bloqueada. Fale com o suporte da EstetiQI.",
        },
        { status: 403 }
      );
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("Retry procedure protocol delivery error:", error);
    return Response.json(
      { error: "Não foi possível tentar o envio novamente." },
      { status: 500 }
    );
  }
}
