import { requireCurrentUser } from "@/lib/auth/require-current-user";

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

    return Response.json({
      user: currentUser.user,
      organization: currentUser.organization,
      role: currentUser.role,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Auth me error:", error);

    return Response.json(
      { error: "Não foi possível obter o usuário atual." },
      { status: 500 },
    );
  }
}
