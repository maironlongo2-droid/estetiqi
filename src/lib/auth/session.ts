import { createHash, randomBytes } from "node:crypto";
import { sql } from "@/lib/db/client";

const SESSION_DAYS = 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  userId: string,
  organizationId: string
) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  );

  await sql`
    INSERT INTO sessions (
      user_id,
      organization_id,
      token_hash,
      expires_at
    )
    VALUES (
      ${userId},
      ${organizationId},
      ${tokenHash},
      ${expiresAt.toISOString()}
    )
  `;

  return {
    token,
    expiresAt,
  };
}

export async function revokeSession(token: string) {
  const tokenHash = hashToken(token);

  await sql`
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE token_hash = ${tokenHash}
      AND revoked_at IS NULL
  `;
}
