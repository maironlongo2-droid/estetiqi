import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não está configurada.");
}

const sql = neon(databaseUrl);

const migrationsDir = "src/lib/db/migrations";

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .filter((file) => file !== "000_migrations.sql")
  .sort();

for (const file of files) {
  const version = path.basename(file, ".sql");

  const existing = await sql`
    SELECT version
    FROM schema_migrations
    WHERE version = ${version}
  `;

  if (existing.length > 0) {
    console.log(`Já aplicada: ${version}`);
    continue;
  }

  const migration = await readFile(
    path.join(migrationsDir, file),
    "utf8"
  );

  if (migration.includes("$$")) {
    throw new Error(
      `A migration ${version} contém $$ e não pode usar o migrador atual.`
    );
  }

  const statements = migration
    .split(";")
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(Boolean);

  try {
    for (const statement of statements) {
      await sql.query(statement);
    }

    await sql`
      INSERT INTO schema_migrations (version)
      VALUES (${version})
      ON CONFLICT (version) DO NOTHING
    `;

    console.log(`Migration aplicada: ${version}`);

  } catch (error) {
    console.error(`Erro na migration ${version}:`);
    console.error(error);
    process.exit(1);
  }
}

console.log("Migrations concluídas.");
