import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { sql } from "@/lib/db/client";
import { loginSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        {
          error: "E-mail ou senha inválidos.",
        },
        { status: 400 }
      );
    }

    const { email, password } = result.data;

    const users = await sql`
      SELECT
        id,
        name,
        email,
        password_hash
      FROM users
      WHERE email = ${email}
      LIMIT 1
    `;

    if (users.length === 0) {
      return Response.json(
        {
          error: "E-mail ou senha inválidos.",
        },
        { status: 401 }
      );
    }

    const user = users[0];

    const passwordValid = await verifyPassword(
      password,
      user.password_hash
    );

    if (!passwordValid) {
      return Response.json(
        {
          error: "E-mail ou senha inválidos.",
        },
        { status: 401 }
      );
    }

    const session = await createSession(user.id);

    const response = Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });

    response.headers.append(
      "Set-Cookie",
      [
        `estetiqi_session=${session.token}`,
        "HttpOnly",
        "Path=/",
        "SameSite=Lax",
        `Max-Age=${30 * 24 * 60 * 60}`,
        process.env.NODE_ENV === "production" ? "Secure" : "",
      ]
        .filter(Boolean)
        .join("; ")
    );

    return response;
  } catch (error) {
    console.error("Login error:", error);

    return Response.json(
      {
        error: "Não foi possível realizar o login.",
      },
      { status: 500 }
    );
  }
}