import { requireCurrentUser } from "@/lib/auth/require-current-user";

export async function GET(request: Request) {
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
      role: currentUser.role,
    });
  } catch (error) {
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