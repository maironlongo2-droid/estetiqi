import { requireCurrentUser } from "@/lib/auth/require-current-user";

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

    return Response.json({
      authenticated: true,
      user: {
        id: currentUser.user.id,
        name: currentUser.user.name,
        email: currentUser.user.email,
      },
      organization: {
        id: currentUser.organization.id,
        name: currentUser.organization.name,
        slug: currentUser.organization.slug,
      },
      organizationBlocked: false,
      role: currentUser.role,
    });
  } catch (error) {
    // Organização bloqueada pela administração da plataforma: o cliente usa este
    // aviso apenas para exibir a mensagem adequada. A restrição real é aplicada
    // no servidor (todas as demais APIs respondem 403).
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({
        authenticated: true,
        organizationBlocked: true,
        error:
          "A organização está bloqueada. Fale com o suporte da EstetiQI.",
      });
    }

    if (
      error instanceof Error &&
      error.message === "UNAUTHENTICATED"
    ) {
      return Response.json(
        {
          error: "Não autenticado.",
        },
        { status: 401 }
      );
    }

    console.error("Auth context error:", error);

    return Response.json(
      {
        error: "Não foi possível obter o contexto.",
      },
      { status: 500 }
    );
  }
}