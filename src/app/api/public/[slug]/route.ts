import {
  getPublicProcedures,
  getPublicProfessionals,
  getPublishedOrganizationBySlug,
} from "@/lib/public/profile";
import { clientIpFromRequest, rateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

// Perfil público do cartão digital. Não exige autenticação e nunca expõe
// dados administrativos, financeiros ou de outros clientes. O rate limit por
// IP evita varredura de slugs e abuso do endpoint público.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const limit = rateLimit(`public:card:${clientIpFromRequest(request)}`, {
      limit: 60,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      return Response.json(
        { error: "Muitas consultas. Tente novamente em instantes." },
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

    const [procedures, professionals] = await Promise.all([
      getPublicProcedures(organization.id),
      getPublicProfessionals(organization.id),
    ]);

    return Response.json({ organization, procedures, professionals });
  } catch (error) {
    console.error("Get public card error:", error);
    return Response.json(
      { error: "Não foi possível carregar o cartão." },
      { status: 500 }
    );
  }
}
