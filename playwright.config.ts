import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Carrega o ambiente E2E dedicado (gitignored) e o ambiente local de desenvolvimento
// (`.env.local` aponta para a branch de DESENVOLVIMENTO do banco, não para produção; sua
// `DATABASE_URL` entra aqui apenas como referência da trava de segurança abaixo).
// `dotenv` não sobrescreve variáveis já definidas no ambiente.
loadEnv({ path: ".env.e2e", quiet: true });
loadEnv({ path: ".env.local", quiet: true });

const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
const referenceDatabaseUrl = process.env.DATABASE_URL;

function databaseHost(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

// Trava de segurança: os testes E2E nunca podem rodar sem um banco E2E dedicado
// nem apontando para o mesmo banco de referência de `.env.local`.
if (!e2eDatabaseUrl) {
  throw new Error(
    "[E2E] E2E_DATABASE_URL ausente. Defina a connection string da branch Neon 'e2e' em .env.e2e antes de rodar os testes.",
  );
}

if (referenceDatabaseUrl && e2eDatabaseUrl === referenceDatabaseUrl) {
  throw new Error(
    "[E2E] E2E_DATABASE_URL é idêntica à DATABASE_URL de `.env.local`. Abortando para não reutilizar o mesmo banco.",
  );
}

if (referenceDatabaseUrl) {
  const e2eHost = databaseHost(e2eDatabaseUrl);
  const referenceHost = databaseHost(referenceDatabaseUrl);

  if (e2eHost && referenceHost && e2eHost === referenceHost) {
    throw new Error(
      "[E2E] O host do banco E2E coincide com o host da DATABASE_URL de `.env.local`. Abortando para não reutilizar o mesmo banco.",
    );
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  workers: 1,
  globalSetup: "./tests/global-setup.ts",

  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
    },
  },
});
