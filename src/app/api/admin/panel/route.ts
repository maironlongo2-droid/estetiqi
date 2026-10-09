import { getPlatformMetrics } from "@/lib/analytics/platform-metrics";
import { requireSupportAdmin } from "@/lib/support/admin";
import { supportErrorResponse } from "@/lib/support/http";

// Períodos aceitos para as métricas "no período". Qualquer outro valor cai no
// padrão de 30 dias.
const ALLOWED_PERIODS = [7, 30, 90] as const;
const DEFAULT_PERIOD = 30;

// Indicadores agregados de TODAS as organizações da plataforma. Exclusivo do
// administrador da plataforma (allowlist de e-mails verificados em
// SUPPORT_ADMIN_EMAILS): a autorização é resolvida no servidor por
// requireSupportAdmin e qualquer outro usuário recebe 401/403.
//
// O cliente NÃO informa organização alguma — este endpoint é cross-tenant
// apenas porque é uma ferramenta administrativa autorizada. Nenhum dado pessoal
// de cliente (nome, e-mail, telefone, CPF, mensagens) é retornado: apenas
// contagens e somas agregadas.
export async function GET(request: Request) {
  try {
    await requireSupportAdmin();

    const requested = Number(
      new URL(request.url).searchParams.get("days")
    );
    const days = (ALLOWED_PERIODS as readonly number[]).includes(requested)
      ? requested
      : DEFAULT_PERIOD;

    const metrics = await getPlatformMetrics(days);

    return Response.json(metrics);
  } catch (error) {
    return supportErrorResponse(
      error,
      "Não foi possível carregar os indicadores da plataforma."
    );
  }
}
