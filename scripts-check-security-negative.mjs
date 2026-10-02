import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

dotenv.config({ path: ".env.local" });

const BASE_URL = "http://localhost:3000";
const sql = neon(process.env.DATABASE_URL);

const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;

const users = {
  a: {
    name: "Security Test A",
    email: `security-a-${suffix}@estetiqi.local`,
    password: `SecA-${randomBytes(16).toString("hex")}`,
    organizationName: `Security Org A ${suffix}`,
  },
  b: {
    name: "Security Test B",
    email: `security-b-${suffix}@estetiqi.local`,
    password: `SecB-${randomBytes(16).toString("hex")}`,
    organizationName: `Security Org B ${suffix}`,
  },
};

const sessions = {
  a: null,
  b: null,
};

const organizations = {
  a: null,
  b: null,
};

const resources = {
  clientB: null,
  procedureB: null,
  appointmentB: null,
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FALHOU: ${message}`);
  }

  console.log(`✓ ${message}`);
}

async function request(path, options = {}, sessionCookie = null) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
      ...(options.headers || {}),
    },
  });

  let body = null;

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return { response, body };
}

function extractCookie(response) {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  const sessionCookie = cookies.find((value) =>
    value.startsWith("estetiqi_session=")
  );

  return sessionCookie ? sessionCookie.split(";")[0] : null;
}

async function registerUser(user) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(user),
  });

  assert(
    result.response.status === 201,
    `Registro de ${user.name} funciona`
  );

  return {
    cookie: extractCookie(result.response),
    organizationId: result.body.organization.id,
    userId: result.body.user.id,
  };
}

try {
  console.log("\n=== SECURITY NEGATIVE TESTS ===\n");

  /*
   * 1. Sem sessão
   */
  const unauthenticated = await request("/api/clients");

  assert(
    unauthenticated.response.status === 401,
    `Cliente sem sessão recebe 401 (recebido ${unauthenticated.response.status})`
  );

  /*
   * 2. Criamos duas organizações independentes.
   */
  const accountA = await registerUser(users.a);
  const accountB = await registerUser(users.b);

  sessions.a = accountA.cookie;
  sessions.b = accountB.cookie;

  organizations.a = accountA.organizationId;
  organizations.b = accountB.organizationId;

  assert(
    organizations.a !== organizations.b,
    "Organizações de teste são diferentes"
  );

  /*
   * 3. Organização B cria um cliente.
   */
  const createClientB = await request(
    "/api/clients",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Cliente Isolado B",
        phone: `219${String(Date.now()).slice(-8)}`,
      }),
    },
    sessions.b
  );

  assert(
    createClientB.response.status === 201,
    `Organização B consegue criar cliente (recebido ${createClientB.response.status})`
  );

  resources.clientB = createClientB.body.client;

  /*
   * 4. A não pode enxergar B na listagem.
   */
  const listFromA = await request("/api/clients", {}, sessions.a);

  assert(
    listFromA.response.status === 200,
    "Organização A consegue consultar sua própria lista"
  );

  const leakedClient = listFromA.body.clients?.some(
    (client) => client.id === resources.clientB.id
  );

  assert(
    !leakedClient,
    "Organização A não recebe cliente da organização B na listagem"
  );

  /*
   * 5. A tenta acessar diretamente o cliente de B.
   */
  const directClientAttack = await request(
    `/api/clients/${resources.clientB.id}`,
    {},
    sessions.a
  );

  assert(
    directClientAttack.response.status === 404,
    `Acesso direto de A ao cliente de B retorna 404 (recebido ${directClientAttack.response.status})`
  );

  /*
   * 6. B cria procedimento.
   */
  const createProcedureB = await request(
    "/api/procedures",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Procedimento Isolado B",
        price: 150,
      }),
    },
    sessions.b
  );

  assert(
    createProcedureB.response.status === 201,
    `Organização B consegue criar procedimento (recebido ${createProcedureB.response.status})`
  );

  resources.procedureB = createProcedureB.body.procedure;

  /*
   * 7. A não pode acessar procedimento de B.
   */
  const directProcedureAttack = await request(
    `/api/procedures/${resources.procedureB.id}`,
    {},
    sessions.a
  );

  assert(
    directProcedureAttack.response.status === 404,
    `Acesso direto de A ao procedimento de B retorna 404 (recebido ${directProcedureAttack.response.status})`
  );

  /*
   * 8. B cria agendamento.
   */
  const createAppointmentB = await request(
    "/api/appointments",
    {
      method: "POST",
      body: JSON.stringify({
        clientId: resources.clientB.id,
        procedureId: resources.procedureB.id,
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 86400000 + 60 * 60 * 1000).toISOString(),
      }),
    },
    sessions.b
  );

  assert(
    createAppointmentB.response.status === 201,
    `Organização B consegue criar agendamento (recebido ${createAppointmentB.response.status})`
  );

  resources.appointmentB = createAppointmentB.body.appointment;

  /*
   * 9. A tenta acessar agendamento de B.
   */
  const directAppointmentAttack = await request(
    `/api/appointments/${resources.appointmentB.id}`,
    {},
    sessions.a
  );

  assert(
    directAppointmentAttack.response.status === 404,
    `Acesso direto de A ao agendamento de B retorna 404 (recebido ${directAppointmentAttack.response.status})`
  );

  /*
   * 10. B não pode criar agendamento usando
   * procedimento de outra organização.
   *
   * Criamos explicitamente um procedimento em A
   * para garantir que este teste nunca seja pulado.
   */
  const createProcedureA = await request(
    "/api/procedures",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Procedimento Isolado A",
        price: 100,
      }),
    },
    sessions.a
  );

  assert(
    createProcedureA.response.status === 201,
    `Organização A consegue criar procedimento de teste (recebido ${createProcedureA.response.status})`
  );

  const procedureA = createProcedureA.body.procedure;

  const crossTenantAppointment = await request(
    "/api/appointments",
    {
      method: "POST",
      body: JSON.stringify({
        clientId: resources.clientB.id,
        procedureId: procedureA.id,
        startsAt: new Date(Date.now() + 172800000).toISOString(),
        endsAt: new Date(Date.now() + 172800000 + 60 * 60 * 1000).toISOString(),
      }),
    },
    sessions.b
  );

  assert(
    crossTenantAppointment.response.status >= 400 &&
      crossTenantAppointment.response.status < 500,
    `Relacionamento cruzado entre tenants é rejeitado (recebido ${crossTenantAppointment.response.status})`
  );

  /*
   * 11. Teste de organização_id fornecido pelo cliente.
   *
   * A aplicação deve continuar usando a organização da sessão,
   * e não uma organização enviada pelo usuário.
   */
  const forgedOrganization = await request(
    "/api/clients",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Tentativa de Forjar Tenant",
        phone: `218${String(Date.now()).slice(-8)}`,
        organizationId: organizations.b,
      }),
    },
    sessions.a
  );

  assert(
    forgedOrganization.response.status === 201,
    `Tentativa com organizationId forjado não impede criação legítima (recebido ${forgedOrganization.response.status})`
  );

  assert(
    forgedOrganization.body?.client?.organization_id === organizations.a,
    "organizationId forjado não altera o tenant do cliente"
  );

  /*
   * 12. Role inválida deve ser bloqueada pelo banco.
   */
  let invalidRoleRejected = false;

  try {
    await sql`
      INSERT INTO memberships (
        organization_id,
        user_id,
        role
      )
      VALUES (
        ${organizations.a},
        ${accountA.userId},
        'superadmin'
      )
    `;
  } catch {
    invalidRoleRejected = true;
  }

  assert(
    invalidRoleRejected,
    "Banco rejeita role inválida"
  );

  /*
   * 13. Confirmamos que as duas organizações continuam independentes.
   */
  const tenantCheck = await sql`
    SELECT
      o.id,
      o.name,
      COUNT(DISTINCT m.user_id) AS users
    FROM organizations o
    LEFT JOIN memberships m
      ON m.organization_id = o.id
    WHERE o.id IN (${organizations.a}, ${organizations.b})
    GROUP BY o.id, o.name
    ORDER BY o.name
  `;

  assert(
    tenantCheck.length === 2,
    "As duas organizações de teste continuam separadas no banco"
  );

  console.log("\n=== SECURITY NEGATIVE TESTS PASSOU ===\n");
} catch (error) {
  console.error("\n=== SECURITY NEGATIVE TESTS FALHOU ===\n");
  console.error(error);
  process.exitCode = 1;
} finally {
  const cleanupIds = [
    organizations.a,
    organizations.b,
  ].filter(Boolean);

  for (const organizationId of cleanupIds) {
    try {
      await sql`
        DELETE FROM organizations
        WHERE id = ${organizationId}
      `;
    } catch (cleanupError) {
      console.error(
        `ERRO AO LIMPAR ORGANIZAÇÃO ${organizationId}:`
      );
      console.error(cleanupError);
      process.exitCode = 1;
    }
  }

  if (cleanupIds.length > 0) {
    console.log(`✓ ${cleanupIds.length} organizações temporárias removidas`);
  }
}
