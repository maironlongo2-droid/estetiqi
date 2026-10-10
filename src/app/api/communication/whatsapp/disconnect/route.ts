import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { disconnectOrganizationIntegration } from "@/lib/communication/whatsapp-integration-store";

// Desconexão do número oficial da organização autenticada. Apaga o token
// cifrado e marca o estado como "disconnected" — NÃO apaga a linha nem dados de
// clientes. A organização vem do usuário autenticado, nunca do corpo.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const currentUser = await requireCurrentUser();

    // Conectar/desconectar o número da empresa é uma ação de DONO da organização.
    if (!hasPermission(currentUser.role, "organization", "update")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const result = await disconnectOrganizationIntegration(
      currentUser.organization.id
    );

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

    console.error("Disconnect WhatsApp integration error:", error);

    return Response.json(
      { error: "Não foi possível desconectar o WhatsApp." },
      { status: 500 }
    );
  }
}
