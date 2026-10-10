import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { getWhatsAppIntegrationStatus } from "@/lib/communication/whatsapp-status";
import { readEmbeddedSignupPublicConfig } from "@/lib/communication/whatsapp-embedded-signup";
import { getOrganizationIntegration } from "@/lib/communication/whatsapp-integration-store";

// Estado da integração com a WhatsApp Business Cloud API para a organização
// autenticada. Devolve apenas presença/estado das credenciais — nunca os
// segredos. Quando não há credenciais configuradas no ambiente, nenhuma chamada
// externa é feita e o estado é "not_configured".
export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "organization", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    // A configuração é da plataforma (variáveis de ambiente do servidor). A
    // organização autenticada é validada acima; nenhum dado de outra organização
    // é acessível porque nada por organização é lido aqui ainda.
    const status = await getWhatsAppIntegrationStatus();

    // Estado da conexão DESTA organização (isolamento multitenant). A
    // organização vem do usuário autenticado — nunca do corpo da requisição.
    const organization = await getOrganizationIntegration(
      currentUser.organization.id
    );

    // Configuração PÚBLICA do Embedded Signup. O App Secret (WHATSAPP_APP_SECRET)
    // permanece apenas no servidor; aqui saem apenas App ID e config_id.
    const embeddedSignup = readEmbeddedSignupPublicConfig();

    return Response.json({ ...status, organization, embeddedSignup });
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

    console.error("Get WhatsApp integration status error:", error);

    return Response.json(
      { error: "Não foi possível carregar o estado da integração." },
      { status: 500 }
    );
  }
}
