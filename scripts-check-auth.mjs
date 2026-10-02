import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não está configurada.");
}

const sql = neon(databaseUrl);

const result = await sql`
  SELECT
    u.id AS user_id,
    u.name AS user_name,
    u.email,
    o.id AS organization_id,
    o.name AS organization_name,
    m.role,
    s.expires_at,
    s.revoked_at
  FROM users u
  JOIN memberships m
    ON m.user_id = u.id
  JOIN organizations o
    ON o.id = m.organization_id
  LEFT JOIN sessions s
    ON s.user_id = u.id
  WHERE u.email = 'teste@estetiqi.local'
  ORDER BY s.created_at DESC
  LIMIT 1;
`;

console.log(JSON.stringify(result, null, 2));