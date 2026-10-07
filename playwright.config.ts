import { defineConfig } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Carrega o ambiente E2E dedicado (gitignored) e o ambiente local (DATABASE_URL de produção,
// usado apenas para comparação). `dotenv` não sobrescreve variáveis já definidas no ambiente.
loadEnv({ path: ".env.e2e", quiet: true });
loadEnv({ path: ".env.local", quiet: true });

const e2eDatabaseUrl = process.env.E2E_DATABASE_URL;
const productionDatabaseUrl = process.env.DATABASE_URL;

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
// nem apontando para o banco de produção.
if (!e2eDatabaseUrl) {
  throw new Error(
    "[E2E] E2E_DATABASE_URL ausente. Defina a connection string da branch Neon 'e2e' em .env.e2e antes de rodar os testes.",
  );
}

if (productionDatabaseUrl && e2eDatabaseUrl === productionDatabaseUrl) {
  throw new Error(
    "[E2E] E2E_DATABASE_URL é idêntica a DATABASE_URL (produção). Abortando para não tocar produção.",
  );
}

if (productionDatabaseUrl) {
  const e2eHost = databaseHost(e2eDatabaseUrl);
  const productionHost = databaseHost(productionDatabaseUrl);

  if (e2eHost && productionHost && e2eHost === productionHost) {
    throw new Error(
      "[E2E] O host do banco E2E coincide com o host de produção. Abortando para não tocar produção.",
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
