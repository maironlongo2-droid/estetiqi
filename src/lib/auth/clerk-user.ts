import { sql } from "@/lib/db/client";

export async function getInternalUserByClerkId(clerkUserId: string) {
  const result = await sql`
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.email,
      u.clerk_user_id,
      o.id AS organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      o.clerk_organization_id,
      m.role
    FROM users u
    JOIN memberships m
      ON m.user_id = u.id
    JOIN organizations o
      ON o.id = m.organization_id
    WHERE u.clerk_user_id = ${clerkUserId}
    ORDER BY m.created_at ASC
    LIMIT 1
  `;

  if (result.length === 0) {
    return null;
  }

  return result[0];
}
