// scripts-apply-033-035-036.mjs
//
// NOME HISTORICO: este arquivo tambem contempla a migration 037. O nome foi
// mantido para NAO quebrar comandos e notas ja existentes; o mesmo utilitario
// pode ser invocado pelo alias scripts-apply-033-035-036-037.mjs (mesma logica,
// mesmo process.argv). Rode `--help` para ver o uso completo.
//
// Aplica EXCLUSIVAMENTE UMA das migrations 033, 035, 036 ou 037 (uma por vez), em
// transacao, com verificacao previa do estado REAL do banco.
//
// NUNCA executa a 034_procedure_protocols.sql e NUNCA percorre/aplica todas as
// migrations pendentes.
//
// FINGERPRINT DO DESTINO: os modos de ESCRITA exigem que o fingerprint do host da
// conexao seja igual ao destino esperado (EXPECTED_DB_FINGERPRINT; por padrao, o
// fingerprint conhecido de producao). Um fingerprint diferente do de producao
// NAO prova que o banco seja de desenvolvimento: confirme o destino no provedor
// e declare EXPECTED_DB_FINGERPRINT com o fingerprint DESTE banco.
//
// TOKEN DE CONFIRMACAO: `APPLY-<VER>-PRODUCTION` e o nome HISTORICO do token
// (criado quando a etapa seria aplicada em producao). Ele NAO significa que a
// operacao deva ser executada em producao: use --apply somente no destino
// correto, sempre conferindo o fingerprint antes.
//
// A connection string vem por DATABASE_URL. Os modos de ESCRITA nao leem
// .env.local. O modo --status (somente leitura) pode carregar .env.local quando
// DATABASE_URL nao estiver no ambiente, para inspecao local. Nenhum modo
// imprime a URL de conexao, a senha ou qualquer outro segredo.
//
// Modos (detalhes em --help):
//   node scripts-apply-033-035-036.mjs --status
//     -> SOMENTE LEITURA: estado real (schema_migrations, tabelas, colunas,
//        constraints, indices, versao do Postgres e possiveis duplicidades).
//   node scripts-apply-033-035-036.mjs <033|035|036|037>
//     -> preflight (somente leitura) da versao escolhida.
//   node scripts-apply-033-035-036.mjs <033|035|036|037> --dry-run
//     -> preflight + executa em transacao e faz ROLLBACK.
//   node scripts-apply-033-035-036.mjs <033|035|036|037> --apply --confirm=APPLY-<VER>-PRODUCTION
//     -> confirmacao explicita + preflight + executa e faz COMMIT.

import dotenv from "dotenv";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { neon, Client } from "@neondatabase/serverless";

const MIGRATIONS_DIR = "src/lib/db/migrations";
const PRODUCTION_FINGERPRINT = "b3668b679c62";
const OUT_OF_SCOPE_VERSION = "034_procedure_protocols";
// Ordem oficial de aplicacao DESTA etapa (a 034 fica FORA).
const APPLY_ORDER = [
  "033_communication_messages",
  "035_whatsapp_integrations",
  "036_inbound_whatsapp_messages",
  "037_whatsapp_integration_credentials",
];

// Versoes contempladas por este utilitario, derivadas da ordem oficial acima
// (fonte unica: evita que a ajuda e os alvos de aplicacao divirjam).
const SUPPORTED_VERSIONS = APPLY_ORDER.map((version) => version.slice(0, 3));

function scriptName() {
  return path.basename(process.argv[1] ?? "scripts-apply-033-035-036.mjs");
}

// Texto de ajuda/uso. Usado pelo modo --help e pelas mensagens de erro de
// argumento, para que exista uma unica descricao do uso correto.
function usage() {
  const versions = SUPPORTED_VERSIONS.join("|");
  return [
    `Uso: node ${scriptName()} <${versions}>             (preflight, somente leitura)`,
    `     node ${scriptName()} <${versions}> --dry-run   (simula em transacao e faz ROLLBACK)`,
    `     node ${scriptName()} <${versions}> --apply --confirm=APPLY-<VER>-PRODUCTION`,
    `     node ${scriptName()} --status                  (estado real, somente leitura)`,
    `     node ${scriptName()} --help`,
    "",
    `Versoes contempladas: ${SUPPORTED_VERSIONS.join(", ")} (a 034 fica FORA desta etapa).`,
    "",
    "O token --confirm=APPLY-<VER>-PRODUCTION tem nome HISTORICO e NAO significa que",
    "a operacao deva ser executada em producao: use --apply apenas no destino correto",
    "e com o fingerprint esperado confirmado.",
  ].join("\n");
}

if (process.argv.slice(2).some((arg) => arg === "--help" || arg === "-h")) {
  console.log(usage());
  process.exit(0);
}

function fail(message) {
  console.error(`ABORTADO: ${message}`);
  process.exit(1);
}

function numericPrefix(version) {
  const match = /^(\d+)/.exec(version);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

function localVersions() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => file !== "000_migrations.sql")
    .map((file) => path.basename(file, ".sql"))
    .sort();
}

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--dry-run")
    ? "dry-run"
    : process.argv.includes("--status")
      ? "status"
      : "preflight";

// O modo somente leitura pode usar .env.local como fallback, sem imprimir nada
// dele. Os modos de escrita exigem DATABASE_URL apenas do ambiente.
if (!process.env.DATABASE_URL && mode === "status") {
  dotenv.config({ path: ".env.local", quiet: true });
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  fail(
    "DATABASE_URL nao definida. Exporte a connection string do destino (ou use --status com .env.local)."
  );
}

const sql = neon(databaseUrl);

// Destino esperado. Sem EXPECTED_DB_FINGERPRINT o padrao e o fingerprint
// conhecido de PRODUCAO (fail-safe: um destino desconhecido nunca casa).
// Diferir do fingerprint de producao NAO prova que o banco seja de
// desenvolvimento, por isso a declaracao do operador e exigida nos modos de
// escrita (EXPECTED_DB_FINGERPRINT) e as mensagens reforcam essa confirmacao.
const declaredFingerprint = process.env.EXPECTED_DB_FINGERPRINT;
const expectedFingerprint = declaredFingerprint || PRODUCTION_FINGERPRINT;
const expectedIsProductionDefault = !declaredFingerprint;

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
if (mode !== "status") {
  if (fingerprint !== expectedFingerprint) {
    fail(
      [
        "a conexao NAO corresponde ao destino esperado (fingerprint diferente).",
        "Nenhuma operacao sera executada.",
        "Diferir do fingerprint de producao NAO prova que este banco seja de desenvolvimento.",
        "Confirme o destino no provedor e, se ele for o banco correto, defina EXPECTED_DB_FINGERPRINT com o fingerprint declarado acima.",
      ].join(" ")
    );
  }
  console.log(
    expectedIsProductionDefault
      ? "destino_esperado=fingerprint conhecido de PRODUCAO (padrao, sem EXPECTED_DB_FINGERPRINT). Confirme no provedor que este banco e realmente producao antes de aplicar."
      : "destino_esperado=declarado pelo operador via EXPECTED_DB_FINGERPRINT. Confirme no provedor que este fingerprint e o banco correto: ele difere do de producao, mas isso NAO prova que seja desenvolvimento."
  );
}

// --- consultas de leitura --------------------------------------------------

async function tableExists(name) {
  const rows = await sql.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function columnExists(table, column) {
  const rows = await sql.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function tableColumns(table) {
  const rows = await sql.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  return rows.map((row) => row.column_name);
}

async function constraintExists(table, name) {
  const rows = await sql.query(
    `SELECT 1 FROM pg_constraint c
       JOIN pg_class t ON t.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND t.relname = $1 AND c.conname = $2 LIMIT 1`,
    [table, name]
  );
  return rows.length > 0;
}

async function indexExists(name) {
  const rows = await sql.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1 LIMIT 1`,
    [name]
  );
  return rows.length > 0;
}

async function registeredVersions() {
  if (!(await tableExists("schema_migrations"))) return [];
  const rows = await sql.query(
    "SELECT version FROM schema_migrations ORDER BY version"
  );
  return rows.map((row) => row.version);
}

async function serverVersionNum() {
  const rows = await sql.query(
    "SELECT current_setting('server_version_num')::int AS v"
  );
  return rows[0].v;
}

// --- especificacao das migrations alvo (034 fica FORA) ---------------------

// NOME HISTORICO DO TOKEN: os valores APPLY-<VER>-PRODUCTION foram criados
// quando esta etapa seria aplicada em producao. O sufixo NAO indica que a
// operacao deva rodar em producao: --apply deve ser usado somente no destino
// correto, com o fingerprint esperado confirmado. Renomear o token mudaria um
// fluxo ja registrado em comandos e notas, por isso NAO foi feito aqui.
const TARGETS = {
  "033": {
    version: "033_communication_messages",
    confirm: "APPLY-033-PRODUCTION",
    minServerVersion: 150000, // ON DELETE SET NULL (coluna) exige PG >= 15
    requiredTables: [
      "organizations",
      "users",
      "clients",
      "procedures",
      "appointments",
    ],
    requiredConstraints: [
      ["clients", "clients_id_organization_unique"],
      ["procedures", "procedures_id_organization_unique"],
      ["appointments", "appointments_id_org_unique"],
    ],
    // Migracoes base cujas constraints compostas (id, organization_id) sao
    // exigidas pelas FKs compostas de 033.
    requiredVersions: [
      "001_initial_auth",
      "003_clients",
      "004_clients_source",
      "005_normalize_client_phones",
      "006_clients_unique_fields",
      "007_procedures",
      "008_appointments",
      "010_tenant_integrity",
      "022_tenant_integrity_finance_ai",
    ],
    partialTables: ["communication_messages"],
    partialColumns: [],
  },
  "035": {
    version: "035_whatsapp_integrations",
    confirm: "APPLY-035-PRODUCTION",
    minServerVersion: 0,
    requiredTables: ["organizations"],
    requiredConstraints: [],
    requiredVersions: [],
    partialTables: ["whatsapp_integrations"],
    partialColumns: [],
  },
  "036": {
    version: "036_inbound_whatsapp_messages",
    confirm: "APPLY-036-PRODUCTION",
    minServerVersion: 0,
    requiredTables: ["communication_messages", "whatsapp_integrations"],
    requiredConstraints: [],
    requiredVersions: [],
    partialTables: [],
    partialColumns: [
      ["communication_messages", "message_type"],
      ["communication_messages", "metadata"],
    ],
  },
  // 037 completa a conexao oficial: coluna CIFRADA do token + ciclo de vida.
  "037": {
    version: "037_whatsapp_integration_credentials",
    confirm: "APPLY-037-PRODUCTION",
    minServerVersion: 0,
    requiredTables: ["whatsapp_integrations"],
    requiredConstraints: [],
    requiredVersions: ["035_whatsapp_integrations"],
    partialTables: [],
    // Aplicacao PARCIAL: confere TODAS as colunas novas da 037. Verificado no
    // repositorio: nenhuma outra migration cria estas colunas (a 035 cria a
    // propria tabela com outros nomes), entao a presenca de qualquer uma delas
    // sem a versao registrada indica mesmo aplicacao parcial.
    // A constraint whatsapp_integrations_status_check fica FORA daqui de
    // proposito: ela ja existe desde a 035 e geraria falso positivo.
    partialColumns: [
      ["whatsapp_integrations", "access_token_encrypted"],
      ["whatsapp_integrations", "token_expires_at"],
      ["whatsapp_integrations", "connected_at"],
      ["whatsapp_integrations", "disconnected_at"],
      ["whatsapp_integrations", "last_webhook_at"],
    ],
  },
};

// Estrutura esperada das migrations 030-037 usada APENAS pelo modo --status
// (SOMENTE LEITURA). Serve para RELATAR o estado real do banco e detectar
// aplicacao PARCIAL (objetos presentes sem a versao registrada em
// schema_migrations). NAO amplia os alvos de aplicacao: TARGETS, preflight,
// --dry-run e --apply continuam exatamente iguais.
const EXPECTED_STRUCTURE = {
  "030_business_and_professional_photos": {
    columns: [
      ["organizations", "logo_image"],
      ["organizations", "logo_mime_type"],
      ["organizations", "logo_updated_at"],
      ["professionals", "photo_image"],
      ["professionals", "photo_mime_type"],
      ["professionals", "photo_updated_at"],
    ],
  },
  "031_public_contacts_and_specialty": {
    columns: [
      ["organizations", "public_whatsapp"],
      ["organizations", "public_maps_url"],
      ["professionals", "specialty"],
    ],
  },
  "032_platform_admin": {
    columns: [
      ["organizations", "status"],
      ["organizations", "blocked_at"],
      ["organizations", "blocked_reason"],
      ["organizations", "blocked_by"],
      ["organizations", "subscribed_at"],
      ["organizations", "subscription_canceled_at"],
      ["organizations", "acquisition_source"],
    ],
    constraints: [["organizations", "organizations_status_check"]],
    tables: ["platform_admin_actions"],
    indexes: ["idx_platform_admin_actions_organization"],
  },
  "033_communication_messages": {
    tables: ["communication_messages"],
    columns: [
      ["communication_messages", "organization_id"],
      ["communication_messages", "client_id"],
      ["communication_messages", "appointment_id"],
      ["communication_messages", "procedure_id"],
      ["communication_messages", "channel"],
      ["communication_messages", "direction"],
      ["communication_messages", "category"],
      ["communication_messages", "status"],
      ["communication_messages", "provider_message_id"],
      ["communication_messages", "source"],
    ],
    constraints: [
      ["communication_messages", "communication_messages_channel_check"],
      ["communication_messages", "communication_messages_direction_check"],
      ["communication_messages", "communication_messages_category_check"],
      ["communication_messages", "communication_messages_status_check"],
      ["communication_messages", "communication_messages_client_org_fk"],
      ["communication_messages", "communication_messages_appointment_org_fk"],
      ["communication_messages", "communication_messages_procedure_org_fk"],
    ],
    indexes: [
      "idx_communication_messages_organization",
      "idx_communication_messages_client",
      "idx_communication_messages_status",
      "uq_communication_messages_provider_id",
    ],
  },
  "035_whatsapp_integrations": {
    tables: ["whatsapp_integrations"],
    columns: [
      ["whatsapp_integrations", "organization_id"],
      ["whatsapp_integrations", "provider"],
      ["whatsapp_integrations", "phone_number_id"],
      ["whatsapp_integrations", "business_account_id"],
      ["whatsapp_integrations", "status"],
      ["whatsapp_integrations", "webhook_configured"],
    ],
    constraints: [
      ["whatsapp_integrations", "whatsapp_integrations_status_check"],
    ],
    indexes: ["uq_whatsapp_integrations_organization"],
  },
  "036_inbound_whatsapp_messages": {
    columns: [
      ["communication_messages", "message_type"],
      ["communication_messages", "event_at"],
      ["communication_messages", "whatsapp_phone_number_id"],
      ["communication_messages", "sender_phone"],
      ["communication_messages", "metadata"],
    ],
    indexes: [
      "idx_communication_messages_direction",
      "uq_whatsapp_integrations_phone_number_id",
    ],
  },
  "037_whatsapp_integration_credentials": {
    columns: [
      ["whatsapp_integrations", "access_token_encrypted"],
      ["whatsapp_integrations", "token_expires_at"],
      ["whatsapp_integrations", "connected_at"],
      ["whatsapp_integrations", "disconnected_at"],
      ["whatsapp_integrations", "last_webhook_at"],
    ],
    constraints: [
      ["whatsapp_integrations", "whatsapp_integrations_status_check"],
    ],
  },
};

function selectedTarget() {
  for (const arg of process.argv.slice(2)) {
    if (Object.prototype.hasOwnProperty.call(TARGETS, arg)) return arg;
  }
  return null;
}

async function statusReport() {
  const serverVersion = await serverVersionNum();
  console.log(`postgres_server_version_num=${serverVersion}`);

  const registered = await registeredVersions();
  console.log(`schema_migrations=${registered.length}`);
  console.log(`registradas=[${registered.join(", ")}]`);
  const pendingLocal = localVersions().filter(
    (version) => !registered.includes(version)
  );
  console.log(`pendentes_locais=[${pendingLocal.join(", ")}]`);

  for (const spec of Object.values(TARGETS)) {
    console.log(
      `${spec.version} registrada=${registered.includes(spec.version)}`
    );
  }

  for (const table of ["communication_messages", "whatsapp_integrations"]) {
    const exists = await tableExists(table);
    console.log(`tabela ${table} existe=${exists}`);
    if (exists) {
      const columns = await tableColumns(table);
      console.log(`  colunas ${table}=[${columns.join(", ")}]`);
    }
  }

  const constraints = [
    ["clients", "clients_id_organization_unique"],
    ["procedures", "procedures_id_organization_unique"],
    ["appointments", "appointments_id_org_unique"],
    ["communication_messages", "communication_messages_category_check"],
    ["communication_messages", "communication_messages_status_check"],
  ];
  for (const [table, name] of constraints) {
    const value = (await tableExists(table))
      ? await constraintExists(table, name)
      : "n/d";
    console.log(`constraint ${table}.${name}=${value}`);
  }

  const indexes = [
    "uq_communication_messages_provider_id",
    "idx_communication_messages_direction",
    "uq_whatsapp_integrations_organization",
    "uq_whatsapp_integrations_phone_number_id",
    "uq_clients_organization_phone",
  ];
  for (const name of indexes) {
    console.log(`indice ${name}=${await indexExists(name)}`);
  }

  if (await tableExists("whatsapp_integrations")) {
    const rows = await sql.query(
      `SELECT COUNT(*)::int AS c FROM (
         SELECT phone_number_id FROM whatsapp_integrations
         WHERE phone_number_id IS NOT NULL
         GROUP BY phone_number_id HAVING COUNT(*) > 1
       ) duplicates`
    );
    console.log(`whatsapp_integrations numeros_duplicados=${rows[0].c}`);
  } else {
    console.log(
      "whatsapp_integrations numeros_duplicados=n/d (tabela ausente)"
    );
  }

  // --- Estrutura esperada por versao (SOMENTE LEITURA) ----------------------
  // Para cada migration desta serie, confere tabelas, colunas, constraints e
  // indices esperados e imprime um veredito. Nao altera nada e nao amplia os
  // alvos de aplicacao. Objetos presentes SEM a versao registrada indicam
  // possivel aplicacao PARCIAL, a ser revista manualmente antes de reaplicar.
  for (const version of Object.keys(EXPECTED_STRUCTURE).sort()) {
    const spec = EXPECTED_STRUCTURE[version];
    const missing = [];

    for (const table of spec.tables ?? []) {
      if (!(await tableExists(table))) missing.push(`tabela ${table}`);
    }
    for (const [table, column] of spec.columns ?? []) {
      if (!(await columnExists(table, column))) {
        missing.push(`coluna ${table}.${column}`);
      }
    }
    for (const [table, name] of spec.constraints ?? []) {
      if (!(await constraintExists(table, name))) {
        missing.push(`constraint ${table}.${name}`);
      }
    }
    for (const name of spec.indexes ?? []) {
      if (!(await indexExists(name))) missing.push(`indice ${name}`);
    }

    const state = missing.length === 0 ? "COMPLETA" : "INCOMPLETA";
    console.log(
      `estrutura ${version} registrada=${registered.includes(version)} ${state}`
    );
    if (missing.length > 0) {
      console.log(`  faltando: ${missing.join(", ")}`);
    }
    // Detecta APLICACAO PARCIAL: todos os objetos esperados existem, mas a
    // versao NAO esta registrada em schema_migrations. Nao reaplicar sem
    // revisao manual (as FKs de 033 nao sao idempotentes).
    if (missing.length === 0 && !registered.includes(version)) {
      console.log(
        `  AVISO: objetos de ${version} existem no banco, mas a versao NAO esta registrada em schema_migrations (possivel aplicacao PARCIAL).`
      );
    }

  }

  // Aviso NAO bloqueante. Nenhuma conexao alternativa e tentada; apenas
  // informamos o estado observado. IMPORTANTE: diferir do fingerprint de
  // producao NAO prova que este banco seja de desenvolvimento (pode ser outro
  // banco, outro branch ou outra conta). A prova exige confirmar o destino no
  // provedor e declarar EXPECTED_DB_FINGERPRINT com o fingerprint deste banco.
  if (fingerprint !== expectedFingerprint) {
    console.log(
      "aviso: o fingerprint desta conexao difere do destino de producao conhecido. Isso NAO prova que este banco seja de desenvolvimento: confirme o destino antes de qualquer escrita e, se este for o banco correto, defina EXPECTED_DB_FINGERPRINT com o fingerprint acima (o modo --status nao escreve nada)."
    );
  }
}

async function preflight(spec) {
  const local = localVersions();
  if (!local.includes(spec.version)) {
    fail(`arquivo local ${spec.version}.sql nao encontrado.`);
  }

  const registered = await registeredVersions();
  if (registered.includes(spec.version)) {
    console.log(`${spec.version} ja registrada em schema_migrations.`);
    return { alreadyApplied: true };
  }

  // Aplicacao PARCIAL: se os objetos criados ja existem sem registro, NAO
  // reaplicar automaticamente (as FKs de 033 nao sao idempotentes).
  for (const table of spec.partialTables) {
    if (await tableExists(table)) {
      fail(
        `possivel aplicacao PARCIAL: tabela ${table} ja existe, mas ${spec.version} nao esta registrada. Revise manualmente antes de reaplicar.`
      );
    }
  }
  for (const [table, column] of spec.partialColumns) {
    if (await columnExists(table, column)) {
      fail(
        `possivel aplicacao PARCIAL: coluna ${table}.${column} ja existe, mas ${spec.version} nao esta registrada. Revise manualmente antes de reaplicar.`
      );
    }
  }

  for (const table of spec.requiredTables) {
    if (!(await tableExists(table))) {
      fail(
        `pre-requisito ausente: tabela ${table} nao existe. Aplique a migration base correspondente antes de ${spec.version}.`
      );
    }
  }
  for (const [table, name] of spec.requiredConstraints) {
    if (!(await constraintExists(table, name))) {
      fail(
        `pre-requisito ausente: constraint ${table}.${name}. Aplique a migration base (010/022) antes de ${spec.version}.`
      );
    }
  }

  if (spec.minServerVersion > 0) {
    const serverVersion = await serverVersionNum();
    if (serverVersion < spec.minServerVersion) {
      fail(
        `Postgres ${serverVersion} < ${spec.minServerVersion} exigido por ${spec.version}.`
      );
    }
  }

  // Pre-requisitos de VERSAO declarados explicitamente para este alvo.
  const missingVersions = spec.requiredVersions.filter(
    (version) => !registered.includes(version)
  );
  if (missingVersions.length > 0) {
    fail(
      `pre-requisitos de versao ausentes em schema_migrations: ${missingVersions.join(", ")}`
    );
  }

  // Ordem oficial: todas as versoes ANTERIORES da sequencia desta etapa devem
  // estar registradas (garante 033 -> 035 -> 036 -> 037).
  const orderIndex = APPLY_ORDER.indexOf(spec.version);
  const priorOrder = APPLY_ORDER.slice(0, orderIndex);
  const missingPrior = priorOrder.filter(
    (version) => !registered.includes(version)
  );
  if (missingPrior.length > 0) {
    fail(`aplique primeiro (na ordem da etapa): ${missingPrior.join(", ")}`);
  }

  // Aviso (NAO bloqueante): outras migrations anteriores ainda pendentes neste
  // banco, fora desta etapa. NAO serao aplicadas por engano.
  const target = numericPrefix(spec.version);
  const pendingEarlier = local.filter(
    (version) =>
      numericPrefix(version) < target &&
      version !== OUT_OF_SCOPE_VERSION &&
      !APPLY_ORDER.includes(version) &&
      !registered.includes(version)
  );
  if (pendingEarlier.length > 0) {
    console.log(
      `aviso: outras migrations anteriores pendentes (fora desta etapa): ${pendingEarlier.join(", ")}`
    );
  }

  console.log(`preflight=${spec.version} OK`);
  return { alreadyApplied: false };
}

// --- execucao transacional -------------------------------------------------

function targetStatements(spec) {
  const file = path.join(MIGRATIONS_DIR, `${spec.version}.sql`);
  const content = readFileSync(file, "utf8");
  if (content.includes("$$")) {
    fail(
      `o arquivo ${spec.version}.sql contem $$; a divisao por ';' nao e segura.`
    );
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

async function runTargetTransaction(spec, { commit }) {
  const statements = targetStatements(spec);
  const client = new Client(databaseUrl);
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query(
      "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
      [spec.version]
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
      `FALHOU ao executar ${spec.version}: ${
        error && error.code ? error.code : "erro desconhecido"
      }`
    );
    console.error("Transacao revertida. Nenhum sucesso e declarado.");
    process.exit(1);
  } finally {
    await client.end();
  }
}

function confirmationToken() {
  const flag = process.argv.find((arg) => arg.startsWith("--confirm="));
  if (flag) return flag.slice("--confirm=".length);
  return process.env.CONFIRM_APPLY_MIGRATION || "";
}

// --- despacho --------------------------------------------------------------

if (mode === "status") {
  await statusReport();
  console.log("Somente leitura. Nenhuma alteracao feita.");
} else {
  const key = selectedTarget();
  if (!key) {
    fail(
      `informe a versao alvo (${SUPPORTED_VERSIONS.join(", ")}).\n${usage()}`
    );
  }
  const spec = TARGETS[key];

  if (mode === "preflight") {
    const { alreadyApplied } = await preflight(spec);
    console.log(alreadyApplied ? "Nada a fazer." : "preflight=OK");
    console.log("Somente leitura. Nenhuma alteracao feita.");
  } else if (mode === "dry-run") {
    const { alreadyApplied } = await preflight(spec);
    if (alreadyApplied) {
      console.log("Nada a fazer.");
    } else {
      await runTargetTransaction(spec, { commit: false });
      console.log("SIMULACAO concluida (ROLLBACK). Nada foi persistido.");
    }
  } else if (mode === "apply") {
    if (confirmationToken() !== spec.confirm) {
      fail(
        [
          `confirmacao explicita ausente. Reexecute com --confirm=${spec.confirm} (ou defina CONFIRM_APPLY_MIGRATION=${spec.confirm}).`,
          "Esse token tem nome HISTORICO (APPLY-<VER>-PRODUCTION): ele apenas confirma que voce reconhece o comando e NAO significa que a operacao deva ser executada em producao.",
          `Destino esperado: fingerprint ${expectedFingerprint}.`,
        ].join(" ")
      );
    }
    console.log(
      `confirmacao aceita (token historico ${spec.confirm}). Destino desta execucao: fingerprint ${fingerprint} (${
        declaredFingerprint ? "declarado pelo operador" : "padrao de producao"
      }).`
    );
    const { alreadyApplied } = await preflight(spec);
    if (alreadyApplied) {
      fail(`${spec.version} ja registrada. Nada a fazer.`);
    }
    await runTargetTransaction(spec, { commit: true });
    const after = await registeredVersions();
    if (!after.includes(spec.version)) {
      fail(
        "COMMIT reportado, mas a versao nao consta em schema_migrations. Verifique manualmente."
      );
    }
    console.log(`Migration aplicada: ${spec.version}`);
    console.log("Concluido.");
  }
}

