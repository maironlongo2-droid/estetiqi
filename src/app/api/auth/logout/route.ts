import { revokeSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");

    if (cookieHeader) {
      const cookies = cookieHeader
        .split(";")
        .map((cookie) => cookie.trim());

      const sessionCookie = cookies.find((cookie) =>
        cookie.startsWith("estetiqi_session=")
      );

      if (sessionCookie) {
        const token = sessionCookie.substring(
          "estetiqi_session=".length
        );

        if (token) {
          await revokeSession(token);
        }
      }
    }

    const response = Response.json({
      success: true,
    });

    response.headers.append(
      "Set-Cookie",
      [
        "estetiqi_session=",
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        "Max-Age=0",
        process.env.NODE_ENV === "production" ? "Secure" : "",
      ]
        .filter(Boolean)
        .join("; ")
    );

    return response;
  } catch (error) {
    console.error("Logout error:", error);

    return Response.json(
      {
        error: "Não foi possível encerrar a sessão.",
      },
      { status: 500 }
    );
  }
}