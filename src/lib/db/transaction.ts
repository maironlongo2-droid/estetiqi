import { Client } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL não está configurada.");
}

export async function withTransaction<T>(
  callback: (client: Client) => Promise<T>
): Promise<T> {
  const client = new Client(databaseUrl);

  await client.connect();

  try {
    await client.query("BEGIN");

    const result = await callback(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Erro no ROLLBACK:", rollbackError);
    }

    throw error;
  } finally {
    await client.end();
  }
}