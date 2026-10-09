import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { getBusinessMetrics } from "@/lib/analytics/business-metrics";

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "intelligence", "read")) {
      return Response.json(
        { error: "Você não tem permissão para visualizar os indicadores." },
        { status: 403 },
      );
    }

    const metrics = await getBusinessMetrics(currentUser.organization.id);

    return Response.json(metrics);
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Analytics error:", error);

    return Response.json(
      { error: "Não foi possível carregar os indicadores." },
      { status: 500 },
    );
  }
}
