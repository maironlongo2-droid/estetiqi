import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { WHATSAPP_ENV_KEYS } from "@/lib/communication/whatsapp-status";
import {
  DEFAULT_GRAPH_API_VERSION,
  exchangeAuthorizationCode,
  extendToLongLivedToken,
  fetchAuthorizedPhoneNumber,
} from "@/lib/communication/whatsapp-connect";
import { WHATSAPP_APP_ID_ENV } from "@/lib/communication/whatsapp-embedded-signup";
import {
  connectOrganizationIntegration,
  readWhatsAppSchemaReadiness,
} from "@/lib/communication/whatsapp-integration-store";
import { readCredentialsKey } from "@/lib/communication/whatsapp-credentials";
import { clientIpFromRequest, rateLimit } from "@/lib/security/rate-limit";

// Conclui o Embedded Signup da Meta para a organização autenticada.
//
// SEGURANÇA: exige usuário autenticado e permissão de DONO (organization:update).
// A organização vem SEMPRE do usuário autenticado — nunca do corpo. O App Secret
// e o token NUNCA são registrados em log nem devolvidos na resposta.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const connectSchema = z.object({
  code: z.string().trim().min(8).max(4096),
  phoneNumberId: z.string().trim().min(1).max(64),
  businessAccountId: z.string().trim().min(1).max(64).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    // Conectar o número oficial da empresa é uma ação de DONO da organização.
    if (!hasPermission(currentUser.role, "organization", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const limit = rateLimit(
      `whatsapp:connect:${currentUser.organization.id}:${clientIpFromRequest(request)}`,
      { limit: 10, windowMs: 60_000 }
    );
    if (!limit.ok) {
      return Response.json(
        { error: "Muitas tentativas. Aguarde um instante." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSeconds) },
        }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = connectSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Dados inválidos para concluir a conexão." },
        { status: 400 }
      );
    }

    // Honestidade: sem a estrutura no banco não há onde guardar a credencial.
    const readiness = await readWhatsAppSchemaReadiness();
    if (!readiness.ready) {
      return Response.json(
        {
          error:
            "A estrutura de conexão do WhatsApp ainda não está aplicada no banco (migrations pendentes).",
          code: "SCHEMA_PENDING",
        },
        { status: 503 }
      );
    }

    if (!readCredentialsKey()) {
      return Response.json(
        {
          error: "A chave de criptografia das credenciais não está configurada no servidor.",
          code: "KEY_MISSING",
        },
        { status: 503 }
      );
    }

    const appId = process.env[WHATSAPP_APP_ID_ENV]?.trim() || null;
    const appSecret = process.env[WHATSAPP_ENV_KEYS.appSecret]?.trim() || null;
    if (!appId || !appSecret) {
      return Response.json(
        {
          error:
            "A integração oficial da Meta (App ID/App Secret) não está configurada no servidor.",
          code: "PLATFORM_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    const graphVersion = DEFAULT_GRAPH_API_VERSION;

    // 1) Troca o `code` do Embedded Signup por um token de acesso.
    const exchange = await exchangeAuthorizationCode({
      code: parsed.data.code,
      appId,
      appSecret,
      graphVersion,
    });
    if (!exchange.ok) {
      return Response.json(
        { error: exchange.message, code: exchange.code },
        { status: 502 }
      );
    }

    // 2) Estende para longa duração. Se a Meta recusar, seguimos com o token
    // curto, mas registramos a expiração REAL (nunca fingimos duração maior).
    let accessToken = exchange.accessToken;
    let expiresInSeconds = exchange.expiresInSeconds;
    const extended = await extendToLongLivedToken({
      accessToken,
      appId,
      appSecret,
      graphVersion,
    });
    if (extended.ok) {
      accessToken = extended.accessToken;
      expiresInSeconds = extended.expiresInSeconds;
    }

    // 3) Confirma que o token realmente LÊ o número informado. Não vinculamos um
    // número que a credencial não consegue acessar.
    const phone = await fetchAuthorizedPhoneNumber({
      phoneNumberId: parsed.data.phoneNumberId,
      accessToken,
      graphVersion,
    });
    if (!phone.ok) {
      return Response.json(
        {
          error: `Não foi possível confirmar o número na Meta: ${phone.message}`,
          code: "PHONE_NOT_AUTHORIZED",
        },
        { status: 400 }
      );
    }

    // 4) Persiste a integração (token CIFRADO). A organização vem do usuário.
    const webhookConfigured = Boolean(
      process.env[WHATSAPP_ENV_KEYS.verifyToken]?.trim()
    );

    const result = await connectOrganizationIntegration({
      organizationId: currentUser.organization.id,
      accessToken,
      tokenExpiresInSeconds: expiresInSeconds,
      phoneNumberId: parsed.data.phoneNumberId,
      businessAccountId: parsed.data.businessAccountId ?? null,
      displayPhoneNumber: phone.phone.displayPhoneNumber,
      verifiedName: phone.phone.verifiedName,
      webhookConfigured,
    });

    if (!result.ok) {
      const status = result.code === "PHONE_NUMBER_IN_USE" ? 409 : 503;
      return Response.json(
        { error: result.message, code: result.code },
        { status }
      );
    }

    return Response.json({ ok: true, organization: result.integration });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json(
        { error: "A organização está bloqueada. Fale com o suporte da EstetiQI." },
        { status: 403 }
      );
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Connect WhatsApp integration error:", error);

    return Response.json(
      { error: "Não foi possível concluir a conexão do WhatsApp." },
      { status: 500 }
    );
  }
}
