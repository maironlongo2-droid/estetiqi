import { getCurrentUser } from "@/lib/auth/current-user";

export async function GET(request: Request) {
  try {
    const currentUser = await getCurrentUser(request);

    if (!currentUser) {
      return Response.json(
        {
          error: "Não autenticado.",
        },
        { status: 401 }
      );
    }

    return Response.json({
      authenticated: true,
      ...currentUser,
    });
  } catch (error) {
    console.error("Auth me error:", error);

    return Response.json(
      {
        error: "Não foi possível verificar a sessão.",
      },
      { status: 500 }
    );
  }
}