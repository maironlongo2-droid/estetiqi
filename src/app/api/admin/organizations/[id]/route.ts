import {
  applyOrganizationAction,
  isPlatformAdminAction,
} from "@/lib/admin/organization-actions";
import { requireSupportAdmin } from "@/lib/support/admin";
import { supportErrorResponse } from "@/lib/support/http";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Acoes administrativas sobre uma organizacao (bloquear/desbloquear, registrar
// assinatura/cancelamento). A autorizacao e SEMPRE resolvida no servidor por
// requireSupportAdmin; nenhum parametro do navegador define quem e administrador.
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireSupportAdmin();

    const { id } = await context.params;

    if (!UUID_PATTERN.test(id)) {
      return Response.json(
        { error: "Identificador inválido." },
        { status: 400 }
      );
    }

    const body = (await request.json().catch(() => null)) as
      | { action?: unknown; reason?: unknown }
      | null;

    if (!body || !isPlatformAdminAction(body.action)) {
      return Response.json({ error: "Ação inválida." }, { status: 400 });
    }

    const reason =
      typeof body.reason === "string" ? body.reason.slice(0, 500) : null;

    const result = await applyOrganizationAction({
      organizationId: id,
      action: body.action,
      reason,
      actorEmail: admin.email,
    });

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.httpStatus });
    }

    return Response.json({
      ok: true,
      status: result.status,
      action: result.action,
    });
  } catch (error) {
    return supportErrorResponse(
      error,
      "Não foi possível concluir a ação administrativa."
    );
  }
}
