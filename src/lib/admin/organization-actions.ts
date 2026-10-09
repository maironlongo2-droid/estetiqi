import { withTransaction } from "@/lib/db/transaction";

// Acoes administrativas da PLATAFORMA sobre uma organizacao. Executadas apenas
// apos requireSupportAdmin (allowlist de e-mails verificados). Tudo roda em uma
// unica transacao: a alteracao de estado e o registro de auditoria sao
// atomicos. O objetivo e NUNCA apagar dados: o bloqueio apenas muda o estado e
// grava o motivo, o administrador responsavel e a data.

export type PlatformAdminAction =
  | "block"
  | "unblock"
  | "subscribe"
  | "cancel_subscription";

export type OrganizationActionResult =
  | { ok: true; status: "active" | "blocked"; action: PlatformAdminAction }
  | { ok: false; error: string; httpStatus: number };

const VALID_ACTIONS: readonly PlatformAdminAction[] = [
  "block",
  "unblock",
  "subscribe",
  "cancel_subscription",
];

export function isPlatformAdminAction(
  value: unknown
): value is PlatformAdminAction {
  return (
    typeof value === "string" &&
    (VALID_ACTIONS as readonly string[]).includes(value)
  );
}

export async function applyOrganizationAction(params: {
  organizationId: string;
  action: PlatformAdminAction;
  reason?: string | null;
  actorEmail: string;
}): Promise<OrganizationActionResult> {
  const reason = (params.reason ?? "").trim() || null;

  return withTransaction(async (client) => {
    const existing = await client.query(
      "SELECT id, status FROM organizations WHERE id = $1 FOR UPDATE",
      [params.organizationId]
    );

    if (existing.rows.length === 0) {
      return {
        ok: false,
        error: "Organização não encontrada.",
        httpStatus: 404,
      } as const;
    }

    let nextStatus: "active" | "blocked" =
      existing.rows[0].status === "blocked" ? "blocked" : "active";

    switch (params.action) {
      case "block":
        await client.query(
          `UPDATE organizations
              SET status = 'blocked',
                  blocked_at = NOW(),
                  blocked_reason = $2,
                  blocked_by = $3,
                  updated_at = NOW()
            WHERE id = $1`,
          [params.organizationId, reason, params.actorEmail]
        );
        nextStatus = "blocked";
        break;
      case "unblock":
        await client.query(
          `UPDATE organizations
              SET status = 'active',
                  blocked_at = NULL,
                  blocked_reason = NULL,
                  blocked_by = NULL,
                  updated_at = NOW()
            WHERE id = $1`,
          [params.organizationId]
        );
        nextStatus = "active";
        break;
      case "subscribe":
        await client.query(
          `UPDATE organizations
              SET subscribed_at = COALESCE(subscribed_at, NOW()),
                  subscription_canceled_at = NULL,
                  updated_at = NOW()
            WHERE id = $1`,
          [params.organizationId]
        );
        break;
      case "cancel_subscription":
        await client.query(
          `UPDATE organizations
              SET subscription_canceled_at = NOW(),
                  updated_at = NOW()
            WHERE id = $1`,
          [params.organizationId]
        );
        break;
    }

    await client.query(
      `INSERT INTO platform_admin_actions
         (organization_id, action, reason, actor_email)
       VALUES ($1, $2, $3, $4)`,
      [params.organizationId, params.action, reason, params.actorEmail]
    );

    return {
      ok: true,
      status: nextStatus,
      action: params.action,
    } as const;
  });
}
