// scripts-apply-030.mjs
//
// Aplica EXCLUSIVAMENTE a migration 030_business_and_professional_photos.sql no
// banco informado por DATABASE_URL, de forma TRANSACIONAL, sem percorrer nem
// aplicar outras migrations pendentes.
//
// A 030 e ADITIVA: adiciona colunas de imagem binaria (BYTEA) em `organizations`
// (logo_image, logo_mime_type, logo_updated_at) e em `professionals`
// (photo_image, photo_mime_type, photo_updated_at). Nao remove, nao recria e nao
// apaga dados; nao toca em foreign keys, RBAC nem no isolamento de tenant.
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
//   node scripts-apply-030.mjs            -> preflight (somente leitura)
//   node scripts-apply-030.mjs --dry-run  -> preflight + executa 030 em transacao e faz ROLLBACK
//   node scripts-apply-030.mjs --apply --confirm=APPLY-030-PRODUCTION
//                                         -> confirmacao + preflight + executa 030 e faz COMMIT
//   node scripts-apply-030.mjs --verify   -> verificacao pos-migration (somente leitura)

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { neon, Client } from "@neondatabase/serverless";

const PRODUCTION_FINGERPRINT = "b3668b679c62";
const CONFIRMATION_TOKEN = "APPLY-030-PRODUCTION";
const MIGRATIONS_DIR = "src/lib/db/migrations";
const TARGET_VERSION = "030_business_and_professional_photos";
const TARGET_FILE = path.join(MIGRATIONS_DIR, `${TARGET_VERSION}.sql`);

// A 030 cria colunas em DUAS tabelas e NAO cria indices.
const TARGET_COLUMNS = {
  organizations: ["logo_image", "logo_mime_type", "logo_updated_at"],
  professionals: ["photo_image", "photo_mime_type", "photo_updated_at"],
};
const EXPECTED_TABLE_COUNT = Object.keys(TARGET_COLUMNS).length;
const EXPECTED_COLUMN_COUNT = Object.values(TARGET_COLUMNS).reduce(
  (total, columns) => total + columns.length,
  0
);

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
  return process.env.CONFIRM_APPLY_030 || "";
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

async function tableColumns(table) {
  const rows = await sql.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1`,
    [table]
  );
  return rows.map((row) => row.column_name);
}

// Divide o arquivo 030 em statements como o migrador existente faz, mas so
// depois de confirmar que o conteudo NAO usa $$ (a 030 atual contem 2 statements
// de topo, sem ponto e virgula dentro de literais).
function targetStatements() {
  const content = readFileSync(TARGET_FILE, "utf8");
  if (content.includes("$$")) {
    fail("o arquivo 030 contem $$; a divisao por ';' nao e segura.");
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
  console.log(`base(001-029) presentes=${missingBase.length === 0}`);
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
  const presentColumns = {};
  let foundColumns = 0;
  for (const [table, expected] of Object.entries(TARGET_COLUMNS)) {
    const columnNames = await tableColumns(table);
    const present = expected.filter((name) => columnNames.includes(name));
    presentColumns[table] = present;
    foundColumns += present.length;
    console.log(
      `colunas ${table} presentes=${present.length}/${expected.length} [${present.join(", ")}]`
    );
  }

  const db = await registeredVersions();
  const registered = db.includes(TARGET_VERSION);
  const columnsApplied = foundColumns === EXPECTED_COLUMN_COUNT;

  console.log(
    `colunas presentes=${foundColumns}/${EXPECTED_COLUMN_COUNT} em ${EXPECTED_TABLE_COUNT} tabelas`
  );
  console.log(`${TARGET_VERSION} registrada=${registered}`);

  // Antes da aplicacao as colunas de imagem nem existem; consultar
  // logo_image / photo_image aqui causaria erro 42703 (coluna inexistente). A
  // contagem agregada (sem dados pessoais) so roda quando ha o que medir.
  if (columnsApplied) {
    const withLogoRows = await sql.query(
      "SELECT COUNT(*)::int AS c FROM organizations WHERE logo_image IS NOT NULL"
    );
    const withPhotoRows = await sql.query(
      "SELECT COUNT(*)::int AS c FROM professionals WHERE photo_image IS NOT NULL"
    );
    console.log(`organizacoes com logo=${withLogoRows[0].c}`);
    console.log(`profissionais com foto=${withPhotoRows[0].c}`);
  } else {
    console.log(
      "contagens nao avaliadas: as colunas de imagem ainda nao existem neste banco."
    );
  }

  const ok = columnsApplied && registered;
  console.log(ok ? "VERIFICACAO=OK" : "VERIFICACAO=FALHOU");
  if (!columnsApplied) {
    console.log(
      `${TARGET_VERSION} ainda NAO aplicada neste banco (colunas de imagem ausentes).`
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
      `confirmacao explicita ausente. Reexecute com --confirm=${CONFIRMATION_TOKEN} (ou defina CONFIRM_APPLY_030=${CONFIRMATION_TOKEN}).`
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
