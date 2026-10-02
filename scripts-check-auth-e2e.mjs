import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { randomBytes } from "node:crypto";

dotenv.config({ path: ".env.local" });

const BASE_URL = "http://localhost:3000";
const sql = neon(process.env.DATABASE_URL);

const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const email = `e2e-${suffix}@estetiqi.local`;
const password = `E2E-${randomBytes(16).toString("hex")}`;
const organizationName = `E2E EstetiQI ${suffix}`;

let organizationId = null;
let cookie = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`FALHOU: ${message}`);
  }
  console.log(`✓ ${message}`);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });

  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  if (setCookies.length > 0) {
    const sessionCookie = setCookies.find((value) =>
      value.startsWith("estetiqi_session=")
    );

    if (sessionCookie) {
      cookie = sessionCookie.split(";")[0];
    }
  }

  let body = null;

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return { response, body };
}

try {
  console.log("\n=== AUTH E2E ===\n");

  const register = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      name: "E2E Test User",
      email,
      password,
      organizationName,
    }),
  });

  assert(
    register.response.status === 201,
    `Registro retorna 201 (recebido ${register.response.status})`
  );

  assert(
    register.body?.user?.email === email,
    "Registro retorna o usuário criado"
  );

  assert(
    register.body?.organization?.name === organizationName,
    "Registro retorna a organização criada"
  );

  assert(
    Boolean(cookie),
    "Registro cria cookie de sessão"
  );

  organizationId = register.body.organization.id;

  const meAfterRegister = await request("/api/auth/me");

  assert(
    meAfterRegister.response.status === 200,
    `Sessão criada funciona no /api/auth/me (recebido ${meAfterRegister.response.status})`
  );

  assert(
    meAfterRegister.body?.user?.email === email,
    "Sessão identifica o usuário correto"
  );

  assert(
    meAfterRegister.body?.organization?.id === organizationId,
    "Sessão está vinculada à organização correta"
  );

  const clients = await request("/api/clients");

  assert(
    clients.response.status === 200,
    `Endpoint protegido aceita sessão válida (recebido ${clients.response.status})`
  );

  assert(
    Array.isArray(clients.body?.clients),
    "GET /api/clients retorna uma lista"
  );

  const logout = await request("/api/auth/logout", {
    method: "POST",
  });

  assert(
    logout.response.status === 200,
    `Logout retorna 200 (recebido ${logout.response.status})`
  );

  cookie = null;

  const meAfterLogout = await request("/api/auth/me");

  assert(
    meAfterLogout.response.status === 401,
    `Sessão encerrada retorna 401 (recebido ${meAfterLogout.response.status})`
  );

  console.log("\n=== AUTH E2E PASSOU ===\n");
  console.log(`Usuário temporário: ${email}`);
  console.log(`Organização temporária: ${organizationId}`);
} catch (error) {
  console.error("\n=== AUTH E2E FALHOU ===\n");
  console.error(error);
  process.exitCode = 1;
} finally {
  if (organizationId) {
    try {
      await sql`
        DELETE FROM organizations
        WHERE id = ${organizationId}
      `;

      console.log("✓ Dados temporários removidos");
    } catch (cleanupError) {
      console.error("ERRO AO LIMPAR DADOS TEMPORÁRIOS:");
      console.error(cleanupError);
      process.exitCode = 1;
    }
  }
}
