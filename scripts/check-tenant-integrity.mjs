import { sql } from "../src/lib/db/client.ts";

const relations = [
  ["appointments", "client_id", "clients"],
  ["appointments", "procedure_id", "procedures"],
  ["payments", "client_id", "clients"],
  ["payments", "appointment_id", "appointments"],
  ["payments", "procedure_id", "procedures"],
  ["customer_events", "client_id", "clients"],
  ["customer_events", "appointment_id", "appointments"],
  ["customer_events", "payment_id", "payments"],
  ["ai_opportunities", "client_id", "clients"],
  ["ai_actions", "client_id", "clients"],
  ["ai_actions", "opportunity_id", "ai_opportunities"],
];

let violations = 0;

console.log("=== VERIFICAÇÃO DE ISOLAMENTO POR ORGANIZAÇÃO ===");

for (const [parent, fk, referenced] of relations) {
  const rows = await sql.query(`
    SELECT COUNT(*)::int AS count
    FROM ${parent} p
    JOIN ${referenced} c ON c.id = p.${fk}
    WHERE p.${fk} IS NOT NULL
      AND p.organization_id <> c.organization_id
  `);

  const count = rows[0]?.count ?? 0;

  if (count > 0) {
    console.error(
      `VIOLAÇÃO: ${parent}.${fk} -> ${referenced}: ${count} registro(s)`
    );
    violations += count;
  } else {
    console.log(`OK: ${parent}.${fk} -> ${referenced}`);
  }
}

const constraints = [
  "appointments_id_org_unique",
  "payments_id_org_unique",
  "ai_opportunities_id_org_unique",
  "payments_client_org_fk",
  "payments_appointment_org_fk",
  "payments_procedure_org_fk",
  "customer_events_client_org_fk",
  "customer_events_appointment_org_fk",
  "customer_events_payment_org_fk",
  "ai_opportunities_client_org_fk",
  "ai_actions_client_org_fk",
  "ai_actions_opportunity_org_fk",
];

console.log("\n=== CONSTRAINTS 022 ===");

for (const name of constraints) {
  const rows = await sql.query(`
    SELECT conname, contype, convalidated
    FROM pg_constraint
    WHERE conname = $1
  `, [name]);

  if (rows.length === 0) {
    console.log(`PENDENTE: ${name}`);
  } else {
    console.log(
      `OK: ${name} (${rows[0].contype}, validated=${rows[0].convalidated})`
    );
  }
}

console.log(
  `\nResultado dos dados: ${
    violations === 0 ? "NENHUMA VIOLAÇÃO" : `${violations} VIOLAÇÃO(ÕES)`
  }`
);

process.exitCode = violations === 0 ? 0 : 1;
