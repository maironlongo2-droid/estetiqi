// scripts-apply-029.mjs
//
// Aplica EXCLUSIVAMENTE a migration 029_public_booking.sql no banco informado
// por DATABASE_URL, de forma TRANSACIONAL, sem percorrer nem aplicar outras
// migrations pendentes.
//
// A 029 e ADITIVA: adiciona 5 colunas de apresentacao publica em `organizations`
// (public_slug, public_published, public_headline, public_bio, public_instagram)
// e um indice unico PARCIAL por LOWER(public_slug). Nao remove, nao recria e nao
// apaga dados; nao toca em foreign keys, RBAC ou isolamento de tenant.
//
// A connection string vem SOMENTE por variavel de ambiente (DATABASE_URL).
// Este script NAO le .env.local e NAO grava/imprime segredos nem a URL completa.
//
// Destino: por padrao, SOMENTE o fingerprint de PRODUCAO e aceito. Para validar
// localmente (ex.: banco de desenvolvimento) e OBRIGATORIO declarar o destino
// esperado via EXPECTED_DB_FINGERPRINT. Sem essa declaracao, qualquer outro
// destino e bloqueado ANTES de qualquer operacao.
//
// Modos:
//   node scripts-apply-029.mjs            -> preflight (somente leitura)
//   node scripts-apply-029.mjs --dry-run  -> preflight + executa 029 em transacao e faz ROLLBACK
//   node scripts-apply-029.mjs --apply --confirm=APPLY-029-PRODUCTION
//                                         -> confirmacao + preflight + executa 029 e faz COMMIT
//   node scripts-apply-029.mjs --verify   -> verificacao pos-migration (somente leitura)

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { neon, Client } from "@neondatabase/serverless";

const PRODUCTION_FINGERPRINT = "b3668b679c62";
const CONFIRMATION_TOKEN = "APPLY-029-PRODUCTION";
const MIGRATIONS_DIR = "src/lib/db/migrations";
const TARGET_VERSION = "029_public_booking";
const TARGET_FILE = path.join(MIGRATIONS_DIR, `${TARGET_VERSION}.sql`);
const EXPECTED_INDEXES = ["uq_organizations_public_slug"];
const EXPECTED_COLUMNS = [
  "public_slug",
  "public_published",
  "public_headline",
  "public_bio",
  "public_instagram",
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

// Confirmacao explicita adicional exigida apenas no modo --apply.
function confirmationToken() {
  const flag = process.argv.find((arg) => arg.startsWith("--confirm="));
  const fromFlag = flag ? flag.slice("--confirm=".length) : "";
  if (fromFlag) return fromFlag;
  return process.env.CONFIRM_APPLY_029 || "";
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail(
    "DATABASE_URL nao definida. Exporte a connection string do destino apenas via variavel de ambiente."
  );
}

const expectedFingerprint =
  process.env.EXPECTED_DB_FINGERPRINT || PRODUCTION_FINGERPRINT;
const usingProductionDefault = !process.env.EXPECTED_DB_FINGERPRINT;

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
if (fingerprint !== expectedFingerprint) {
  fail(
    "a conexao NAO corresponde ao destino esperado. Nenhuma operacao sera executada."
  );
}
console.log(
  usingProductionDefault
    ? "destino=PRODUCAO (fingerprint confere)"
    : "destino=NAO-PRODUCAO (fingerprint conferido via EXPECTED_DB_FINGERPRINT)"
);

const sql = neon(databaseUrl);

function localVersions() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => file !== "000_migrations.sql")
    .map((file) => path.basename(file, ".sql"))
    .sort();
}

// A tabela de controle pode nao existir em um banco onde nenhuma migration foi
// aplicada. A verificacao precisa reportar isso em vez de estourar um erro.
async function tableExists(name) {
  const rows = await sql.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = $1
     LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function registeredVersions() {
  if (!(await tableExists("schema_migrations"))) {
    return [];
  }
  const rows = await sql.query(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  return rows.map((row) => row.version);
}

// Divide o arquivo 029 em statements como o migrador existente faz, mas so
// depois de confirmar que o conteudo NAO usa $$ (a 029 atual contem 2 statements
// de topo, sem ponto e virgula dentro de literais).
function targetStatements() {
  const content = readFileSync(TARGET_FILE, "utf8");
  if (content.includes("$$")) {
    fail("o arquivo 029 contem $$; a divisao por ';' nao e segura.");
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
  console.log(`base(001-028) presentes=${missingBase.length === 0}`);
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
  const columns = await sql.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'organizations'
       AND column_name = ANY($1::text[])`,
    [EXPECTED_COLUMNS]
  );
  const columnNames = columns.map((row) => row.column_name);
  const presentColumns = EXPECTED_COLUMNS.filter((name) =>
    columnNames.includes(name)
  );

  const indexes = await sql.query(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'organizations'
       AND indexname = ANY($1::text[])`,
    [EXPECTED_INDEXES]
  );
  const indexNames = indexes.map((row) => row.indexname);
  const presentIndexes = EXPECTED_INDEXES.filter((name) =>
    indexNames.includes(name)
  );

  const db = await registeredVersions();
  const registered = db.includes(TARGET_VERSION);
  const columnsApplied = presentColumns.length === EXPECTED_COLUMNS.length;

  console.log(
    `colunas presentes=${presentColumns.length}/${EXPECTED_COLUMNS.length} [${presentColumns.join(", ")}]`
  );
  console.log(
    `indices presentes=${presentIndexes.length}/${EXPECTED_INDEXES.length} [${presentIndexes.join(", ")}]`
  );
  console.log(`${TARGET_VERSION} registrada=${registered}`);

  // Antes da aplicacao as colunas publicas nem existem; consultar public_slug /
  // public_published aqui causaria erro 42703 (coluna inexistente). As contagens
  // agregadas (sem dados pessoais) so rodam quando ha o que medir.
  let incoherent = null;
  if (columnsApplied) {
    const withSlugRows = await sql.query(
      "SELECT COUNT(*)::int AS c FROM organizations WHERE public_slug IS NOT NULL"
    );
    const publishedRows = await sql.query(
      "SELECT COUNT(*)::int AS c FROM organizations WHERE public_published = TRUE"
    );
    const incoherentRows = await sql.query(
      `SELECT COUNT(*)::int AS c
       FROM organizations
       WHERE public_published = TRUE AND public_slug IS NULL`
    );
    incoherent = incoherentRows[0].c;

    console.log(`organizacoes com endereco publico=${withSlugRows[0].c}`);
    console.log(`cartoes publicados=${publishedRows[0].c}`);
    console.log(`incoerentes (publicado sem endereco)=${incoherent}`);
  } else {
    console.log(
      "contagens nao avaliadas: as colunas publicas ainda nao existem neste banco."
    );
  }

  const ok =
    columnsApplied &&
    presentIndexes.length === EXPECTED_INDEXES.length &&
    registered &&
    incoherent === 0;
  console.log(ok ? "VERIFICACAO=OK" : "VERIFICACAO=FALHOU");
  if (!columnsApplied) {
    console.log(
      `${TARGET_VERSION} ainda NAO aplicada neste banco (colunas publicas ausentes).`
    );
  }
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
  if (confirmationToken() !== CONFIRMATION_TOKEN) {
    fail(
      `confirmacao explicita ausente. Reexecute com --confirm=${CONFIRMATION_TOKEN} (ou defina CONFIRM_APPLY_029=${CONFIRMATION_TOKEN}).`
    );
  }
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
