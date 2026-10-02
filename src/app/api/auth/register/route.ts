import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { withTransaction } from "@/lib/db/transaction";
import { registerSchema } from "@/lib/validation/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const result = registerSchema.safeParse(body);

    if (!result.success) {
      return Response.json(
        {
          error: "Dados inválidos.",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      name,
      email,
      password,
      organizationName,
    } = result.data;

    const passwordHash = await hashPassword(password);

    const organizationSlug = `${organizationName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100)}-${Date.now()}`;

    const account = await withTransaction(async (client) => {
      const existingUser = await client.query(
        `
          SELECT id
          FROM users
          WHERE email = $1
          LIMIT 1
        `,
        [email]
      );

      if (existingUser.rows.length > 0) {
        const error = new Error("EMAIL_ALREADY_EXISTS");
        throw error;
      }

      const organizationResult = await client.query(
        `
          INSERT INTO organizations (
            name,
            slug
          )
          VALUES ($1, $2)
          RETURNING id, name, slug
        `,
        [organizationName, organizationSlug]
      );

      const organization = organizationResult.rows[0];

      const userResult = await client.query(
        `
          INSERT INTO users (
            name,
            email,
            password_hash
          )
          VALUES ($1, $2, $3)
          RETURNING id, name, email
        `,
        [name, email, passwordHash]
      );

      const user = userResult.rows[0];

      await client.query(
        `
          INSERT INTO memberships (
            organization_id,
            user_id,
            role
          )
          VALUES ($1, $2, $3)
        `,
        [organization.id, user.id, "owner"]
      );

      return {
        user,
        organization,
      };
    });

    const session = await createSession(account.user.id);

    const response = Response.json(
      {
        user: {
          id: account.user.id,
          name: account.user.name,
          email: account.user.email,
        },
        organization: {
          id: account.organization.id,
          name: account.organization.name,
          slug: account.organization.slug,
        },
      },
      { status: 201 }
    );

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
    if (
      error instanceof Error &&
      error.message === "EMAIL_ALREADY_EXISTS"
    ) {
      return Response.json(
        {
          error: "Não foi possível criar a conta com esses dados.",
        },
        { status: 409 }
      );
    }

    console.error("Register error:", error);

    return Response.json(
      {
        error: "Não foi possível criar a conta.",
      },
      { status: 500 }
    );
  }
}