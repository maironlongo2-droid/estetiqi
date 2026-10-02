import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não está configurada.");
}

const sql = neon(databaseUrl);

const tables = await sql`
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('organizations', 'users', 'memberships', 'sessions')
  ORDER BY table_name;
`;

console.log("Tabelas encontradas:");

for (const table of tables) {
  console.log(`- ${table.table_name}`);
}