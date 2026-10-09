import { currentUser } from "@clerk/nextjs/server";
import { sql } from "@/lib/db/client";

export async function ensureClerkUser() {
  const clerkUser = await currentUser();

  if (!clerkUser) {
    throw new Error("UNAUTHENTICATED");
  }

  const clerkUserId = clerkUser.id;

  const email =
    clerkUser.emailAddresses.find(
      (item) => item.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new Error("CLERK_EMAIL_NOT_FOUND");
  }

  const name =
    [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    email.split("@")[0];

  const existing = await sql`
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.email,
      o.id AS organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      o.clerk_organization_id,
      o.status AS organization_status,
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

  if (existing.length > 0) {
    return existing[0];
  }

  // Slug derivado do id do Clerk: a mesma pessoa sempre resolve para a mesma organização.
  const organizationSlug = `negocio-${clerkUserId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 100)}`;
  const organizationName = `Negócio de ${name}`.slice(0, 120);

  // Uma única transação com lock por usuário Clerk: chamadas simultâneas
  // (dashboard dispara várias APIs no primeiro acesso) são serializadas e as
  // seguintes enxergam o que a primeira criou.
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext(${clerkUserId}))`,
    sql`
      INSERT INTO users (name, email, clerk_user_id)
      VALUES (${name}, ${email.toLowerCase()}, ${clerkUserId})
      ON CONFLICT (clerk_user_id) WHERE clerk_user_id IS NOT NULL
      DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email
    `,
    sql`
      INSERT INTO organizations (name, slug)
      SELECT ${organizationName}, ${organizationSlug}
      WHERE NOT EXISTS (
        SELECT 1
        FROM memberships m
        JOIN users u ON u.id = m.user_id
        WHERE u.clerk_user_id = ${clerkUserId}
      )
      ON CONFLICT (slug) DO NOTHING
    `,
    sql`
      INSERT INTO memberships (organization_id, user_id, role)
      SELECT o.id, u.id, 'owner'
      FROM users u
      JOIN organizations o ON o.slug = ${organizationSlug}
      WHERE u.clerk_user_id = ${clerkUserId}
        AND NOT EXISTS (
          SELECT 1 FROM memberships m WHERE m.user_id = u.id
        )
      ON CONFLICT (organization_id, user_id) DO NOTHING
    `,
  ]);

  const result = await sql`
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.email,
      o.id AS organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      o.clerk_organization_id,
      o.status AS organization_status,
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
    throw new Error("INTERNAL_USER_CREATION_FAILED");
  }

  return result[0];
}
