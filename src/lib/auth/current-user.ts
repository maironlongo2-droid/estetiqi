import { createHash } from "node:crypto";
import { sql } from "@/lib/db/client";
import type { Role } from "@/lib/auth/types";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());

  const sessionCookie = cookies.find((cookie) =>
    cookie.startsWith("estetiqi_session=")
  );

  if (!sessionCookie) {
    return null;
  }

  const token = sessionCookie.substring("estetiqi_session=".length);

  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);

  const result = await sql`
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.email,
      o.id AS organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      m.role,
      s.expires_at
    FROM sessions s
    JOIN users u
      ON u.id = s.user_id
    JOIN organizations o
      ON o.id = s.organization_id
    JOIN memberships m
      ON m.user_id = s.user_id
     AND m.organization_id = s.organization_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
    LIMIT 1
  `;

  if (result.length === 0) {
    return null;
  }

  const session = result[0];

  return {
    user: {
      id: session.user_id,
      name: session.user_name,
      email: session.email,
    },
    organization: {
      id: session.organization_id,
      name: session.organization_name,
      slug: session.organization_slug,
    },
    role: session.role as Role,
    expiresAt: session.expires_at,
  };
}
