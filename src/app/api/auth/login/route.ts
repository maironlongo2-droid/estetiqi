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

    const memberships = await sql`
      SELECT
        m.organization_id,
        o.name AS organization_name,
        o.slug AS organization_slug,
        m.role
      FROM memberships m
      JOIN organizations o
        ON o.id = m.organization_id
      WHERE m.user_id = ${user.id}
      ORDER BY m.created_at ASC
    `;

    if (memberships.length === 0) {
      return Response.json(
        {
          error: "Usuário sem organização vinculada.",
        },
        { status: 403 }
      );
    }

    if (memberships.length > 1) {
      return Response.json(
        {
          error: "Usuário vinculado a mais de uma organização.",
        },
        { status: 409 }
      );
    }

    const membership = memberships[0];

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

    const session = await createSession(
      user.id,
      membership.organization_id
    );

    const response = Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      organization: {
        id: membership.organization_id,
        name: membership.organization_name,
        slug: membership.organization_slug,
      },
      role: membership.role,
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