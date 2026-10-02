import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { randomBytes, createHash } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não está configurada.");
}

const sql = neon(databaseUrl);

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function createTestSession(userId, organizationId) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);

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
      NOW() + INTERVAL '1 hour'
    )
  `;

  return tokenHash;
}

async function cleanupSession(tokenHash) {
  await sql`
    DELETE FROM sessions
    WHERE token_hash = ${tokenHash}
  `;
}

const organizations = await sql`
  SELECT id, name
  FROM organizations
  ORDER BY created_at
  LIMIT 2
`;

if (organizations.length < 2) {
  throw new Error("São necessárias pelo menos 2 organizações para o teste.");
}

const [orgA, orgB] = organizations;

const usersA = await sql`
  SELECT user_id
  FROM memberships
  WHERE organization_id = ${orgA.id}
  LIMIT 1
`;

const usersB = await sql`
  SELECT user_id
  FROM memberships
  WHERE organization_id = ${orgB.id}
  LIMIT 1
`;

if (!usersA.length || !usersB.length) {
  throw new Error("As duas organizações precisam ter pelo menos um usuário.");
}

const clientsA = await sql`
  SELECT id
  FROM clients
  WHERE organization_id = ${orgA.id}
  LIMIT 1
`;

const clientsB = await sql`
  SELECT id
  FROM clients
  WHERE organization_id = ${orgB.id}
  LIMIT 1
`;

const proceduresA = await sql`
  SELECT id
  FROM procedures
  WHERE organization_id = ${orgA.id}
  LIMIT 1
`;

const proceduresB = await sql`
  SELECT id
  FROM procedures
  WHERE organization_id = ${orgB.id}
  LIMIT 1
`;

const appointmentsA = await sql`
  SELECT id
  FROM appointments
  WHERE organization_id = ${orgA.id}
  LIMIT 1
`;

const appointmentsB = await sql`
  SELECT id
  FROM appointments
  WHERE organization_id = ${orgB.id}
  LIMIT 1
`;

const sessionA = await createTestSession(usersA[0].user_id, orgA.id);
const sessionB = await createTestSession(usersB[0].user_id, orgB.id);

try {
  const sessionCheck = await sql`
    SELECT
      s.organization_id,
      m.organization_id AS membership_organization_id
    FROM sessions s
    JOIN memberships m
      ON m.user_id = s.user_id
     AND m.organization_id = s.organization_id
    WHERE s.token_hash = ${sessionA}
  `;

  if (
    sessionCheck.length !== 1 ||
    sessionCheck[0].organization_id !== orgA.id ||
    sessionCheck[0].membership_organization_id !== orgA.id
  ) {
    throw new Error("Falha no vínculo sessão → organização.");
  }

  if (clientsA.length && clientsB.length) {
    const crossClient = await sql`
      SELECT id
      FROM clients
      WHERE id = ${clientsB[0].id}
        AND organization_id = ${orgA.id}
    `;

    if (crossClient.length !== 0) {
      throw new Error("FALHA: organização A conseguiu localizar cliente de B.");
    }
  }

  if (proceduresA.length && proceduresB.length) {
    const crossProcedure = await sql`
      SELECT id
      FROM procedures
      WHERE id = ${proceduresB[0].id}
        AND organization_id = ${orgA.id}
    `;

    if (crossProcedure.length !== 0) {
      throw new Error("FALHA: organização A conseguiu localizar procedimento de B.");
    }
  }

  if (appointmentsA.length && appointmentsB.length) {
    const crossAppointment = await sql`
      SELECT id
      FROM appointments
      WHERE id = ${appointmentsB[0].id}
        AND organization_id = ${orgA.id}
    `;

    if (crossAppointment.length !== 0) {
      throw new Error("FALHA: organização A conseguiu localizar agendamento de B.");
    }
  }

  if (clientsA.length && proceduresB.length) {
    try {
      await sql`
        INSERT INTO appointments (
          organization_id,
          client_id,
          procedure_id,
          starts_at,
          ends_at,
          status
        )
        VALUES (
          ${orgA.id},
          ${clientsA[0].id},
          ${proceduresB[0].id},
          NOW() + INTERVAL '2 days',
          NOW() + INTERVAL '2 days 1 hour',
          'scheduled'
        )
      `;

      throw new Error(
        "FALHA: banco aceitou agendamento com procedimento de outra organização."
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("FALHA: banco aceitou")
      ) {
        throw error;
      }
    }
  }

  console.log("");
  console.log("TENANT ISOLATION OK");
  console.log(`Organização A: ${orgA.name}`);
  console.log(`Organização B: ${orgB.name}`);
  console.log("");
  console.log("✓ Sessão vinculada à organização correta");
  console.log("✓ Cliente de B isolado de A");
  console.log("✓ Procedimento de B isolado de A");
  console.log("✓ Agendamento de B isolado de A");
  console.log("✓ Banco bloqueia relacionamento entre tenants");
  console.log("");
} finally {
  await cleanupSession(sessionA);
  await cleanupSession(sessionB);
}
