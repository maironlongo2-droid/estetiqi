import { listOrganizationOverview } from "@/lib/admin/organizations";
import { requireSupportAdmin } from "@/lib/support/admin";
import { supportErrorResponse } from "@/lib/support/http";

// Lista pesquisavel de TODAS as organizacoes com os indicadores usados no
// painel (ranking financeiro, CRM, agendamentos e frequencia). Exclusivo do
// administrador da plataforma (requireSupportAdmin). O cliente NAO informa
// organizacao: a consulta e cross-tenant apenas por ser ferramenta autorizada.
const ALLOWED_PERIODS = [7, 30, 90] as const;
const DEFAULT_PERIOD = 30;

export async function GET(request: Request) {
  try {
    await requireSupportAdmin();

    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("days"));
    const days = (ALLOWED_PERIODS as readonly number[]).includes(requested)
      ? requested
      : DEFAULT_PERIOD;
    const search = (url.searchParams.get("q") ?? "").slice(0, 120);

    const organizations = await listOrganizationOverview({
      periodDays: days,
      search,
      limit: 300,
    });

    return Response.json({ periodDays: days, organizations });
  } catch (error) {
    return supportErrorResponse(
      error,
      "Não foi possível carregar as organizações."
    );
  }
}
