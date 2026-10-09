import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";

dotenv.config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não está configurada.");
}

const sql = neon(databaseUrl);

// Ferramenta local do responsável pelo EstetiQI para consultar as solicitações
// de suporte de todas as organizações. Roda apenas na máquina de quem tem a
// credencial do banco; não expõe nada por API pública.
const rows = await sql`
  SELECT
    s.id,
    o.name AS organization_name,
    u.name AS user_name,
    u.email AS user_email,
    s.category,
    s.subject,
    s.status,
    s.created_at
  FROM support_requests s
  JOIN organizations o ON o.id = s.organization_id
  JOIN users u ON u.id = s.user_id
  ORDER BY s.created_at DESC
  LIMIT 100
`;

if (rows.length === 0) {
  console.log("Nenhuma solicitação de suporte registrada.");
} else {
  console.table(rows);
  console.log(`Total: ${rows.length} solicitação(ões).`);
}
