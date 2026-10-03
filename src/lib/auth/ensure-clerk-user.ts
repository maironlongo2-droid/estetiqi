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

  const organizationSlug = `${email
    .split("@")[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)}-${Date.now()}`;

  const organizationName = `${name}'s negócio`;

  const created = await sql.transaction([
    sql`
      INSERT INTO users (
        name,
        email,
        clerk_user_id
      )
      VALUES (
        ${name},
        ${email.toLowerCase()},
        ${clerkUserId}
      )
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email
      RETURNING id, name, email
    `,
    sql`
      INSERT INTO organizations (
        name,
        slug
      )
      VALUES (
        ${organizationName},
        ${organizationSlug}
      )
      RETURNING id, name, slug
    `,
  ]);

  const user = created[0][0];
  const organization = created[1][0];

  await sql`
    INSERT INTO memberships (
      organization_id,
      user_id,
      role
    )
    VALUES (
      ${organization.id},
      ${user.id},
      'owner'
    )
    ON CONFLICT (organization_id, user_id)
    DO NOTHING
  `;

  const result = await sql`
    SELECT
      u.id AS user_id,
      u.name AS user_name,
      u.email,
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
    throw new Error("INTERNAL_USER_CREATION_FAILED");
  }

  return result[0];
}
