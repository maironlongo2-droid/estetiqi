// scripts-apply-027.mjs
//
// Aplica EXCLUSIVAMENTE a migration 027_support_messages.sql no banco de
// PRODUCAO, de forma TRANSACIONAL, sem percorrer nem aplicar outras
// migrations pendentes.
//
// A connection string vem SOMENTE por variavel de ambiente (DATABASE_URL).
// Este script NAO le .env.local e NAO grava/imprime segredos.
//
// Modos:
//   node scripts-apply-027.mjs            -> preflight (somente leitura)
//   node scripts-apply-027.mjs --dry-run  -> preflight + executa 027 em transacao e faz ROLLBACK
//   node scripts-apply-027.mjs --apply    -> preflight + executa 027 em transacao e faz COMMIT
//   node scripts-apply-027.mjs --verify   -> verificacao pos-migration (somente leitura)

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { neon, Client } from "@neondatabase/serverless";

const PRODUCTION_FINGERPRINT = "b3668b679c62";
const MIGRATIONS_DIR = "src/lib/db/migrations";
const TARGET_VERSION = "027_support_messages";
const TARGET_FILE = path.join(MIGRATIONS_DIR, `${TARGET_VERSION}.sql`);
const EXPECTED_INDEXES = [
  "idx_support_messages_request_id",
  "idx_support_messages_request_created_at",
  "idx_support_messages_organization_created_at",
];

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : process.argv.includes("--verify")
      ? "verify"
      : "preflight";

function fail(message) {
  console.error(`ABORTADO: ${message}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail(
    "DATABASE_URL nao definida. Exporte a connection string de PRODUCAO apenas via variavel de ambiente."
  );
}

let fingerprint;
try {
  fingerprint = crypto
    .createHash("sha256")
    .update(new URL(databaseUrl).host.toLowerCase())
    .digest("hex")
    .slice(0, 12);
} catch {
  fail("DATABASE_URL invalida (nao foi possivel extrair o host).");
}

console.log(`fingerprint=${fingerprint}`);
if (fingerprint !== PRODUCTION_FINGERPRINT) {
  fail("a conexao NAO corresponde a producao. Nenhuma escrita sera feita.");
}
console.log("destino=PRODUCAO (fingerprint confere)");

const sql = neon(databaseUrl);

function localVersions() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => file !== "000_migrations.sql")
    .map((file) => path.basename(file, ".sql"))
    .sort();
}

async function registeredVersions() {
  const rows = await sql.query(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  return rows.map((row) => row.version);
}

// Divide o arquivo 027 em statements como o migrador existente faz, mas so
// depois de confirmar que o conteudo NAO usa $$ (o arquivo 027 atual contem
// apenas 4 statements de topo, sem ponto e virgula dentro de literais).
function targetStatements() {
  const content = readFileSync(TARGET_FILE, "utf8");
  if (content.includes("$$")) {
    fail("o arquivo 027 contem $$; a divisao por ';' nao e segura.");
  }
  return content
    .split(";")
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(Boolean);
}

async function preflight() {
  const local = localVersions();
  if (!local.includes(TARGET_VERSION)) {
    fail(`arquivo local ${TARGET_VERSION}.sql nao encontrado.`);
  }

  const base = local.filter((version) => version !== TARGET_VERSION);
  const db = await registeredVersions();
  const missingBase = base.filter((version) => !db.includes(version));
  const targetPresent = db.includes(TARGET_VERSION);

  console.log(`registradas=${db.length}`);
  console.log(`base(001-026) presentes=${missingBase.length === 0}`);
  console.log(`${TARGET_VERSION} registrada=${targetPresent}`);

  if (missingBase.length > 0) {
    fail(`migrations base ausentes: ${missingBase.join(", ")}`);
  }
  if (targetPresent) {
    fail(`${TARGET_VERSION} ja esta registrada. Nada a fazer.`);
  }
  console.log("preflight=OK");
}

async function runTargetTransaction({ commit }) {
  const statements = targetStatements();
  const client = new Client(databaseUrl);
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [TARGET_VERSION]
    );
    if (commit) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignora falha no rollback
    }
    console.error(
      `FALHOU ao executar ${TARGET_VERSION}: ${
        error && error.code ? error.code : "erro desconhecido"
      }`
    );
    console.error("Transacao revertida. Nenhum sucesso e declarado.");
    process.exit(1);
  } finally {
    await client.end();
  }
}

async function verify() {
  const tables = await sql.query(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'support_messages'"
  );
  const indexes = await sql.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'support_messages'"
  );
  const indexNames = indexes.map((row) => row.indexname);
  const present = EXPECTED_INDEXES.filter((name) => indexNames.includes(name));
  const db = await registeredVersions();
  const registered = db.includes(TARGET_VERSION);

  console.log(`tabela support_messages existe=${tables.length > 0}`);
  console.log(
    `indices presentes=${present.length}/${EXPECTED_INDEXES.length} [${present.join(", ")}]`
  );
  console.log(`${TARGET_VERSION} registrada=${registered}`);

  const ok =
    tables.length > 0 &&
    present.length === EXPECTED_INDEXES.length &&
    registered;
  console.log(ok ? "VERIFICACAO=OK" : "VERIFICACAO=FALHOU");
  process.exit(ok ? 0 : 1);
}

if (mode === "preflight") {
  await preflight();
  console.log("Somente leitura. Nenhuma alteracao feita.");
} else if (mode === "dry-run") {
  await preflight();
  await runTargetTransaction({ commit: false });
  console.log("SIMULACAO concluida (ROLLBACK). Nada foi persistido.");
} else if (mode === "apply") {
  await preflight();
  await runTargetTransaction({ commit: true });
  const db = await registeredVersions();
  if (!db.includes(TARGET_VERSION)) {
    fail(
      "COMMIT reportado, mas a versao nao consta em schema_migrations. Verifique manualmente."
    );
  }
  console.log(`Migration aplicada: ${TARGET_VERSION}`);
  console.log("Concluido.");
} else if (mode === "verify") {
  await verify();
}
