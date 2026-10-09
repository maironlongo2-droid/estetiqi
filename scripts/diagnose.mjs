import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

let failures = 0;
let warnings = 0;

function run(name, command) {
  console.log(`\n===== ${name} =====`);

  try {
    execSync(command, {
      stdio: "inherit",
      shell: true,
    });
    console.log(`[OK] ${name}`);
  } catch {
    failures++;
    console.log(`[ERRO] ${name}`);
  }
}

function walk(dir) {
  const result = [];

  if (!statSync(dir, { throwIfNoEntry: false })) {
    return result;
  }

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      result.push(...walk(full));
    } else {
      result.push(full);
    }
  }

  return result;
}

function checkApiStructure() {
  const root = "src/app/api";

  console.log("\n===== API INVENTORY =====");

  const files = walk(root).filter((file) => file.endsWith("route.ts"));

  if (files.length === 0) {
    console.log("[ERRO] Nenhuma API encontrada.");
    failures++;
    return;
  }

  let handlers = 0;
  let unprotected = 0;

  const methods = [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
  ];

  for (const file of files.sort()) {
    const source = readFileSync(file, "utf8");

    const found = methods.filter((method) =>
      new RegExp(`export async function ${method}\\b`).test(source),
    );

    handlers += found.length;

    const protectedRoute =
      source.includes("requireCurrentUser") ||
      source.includes("requireAuth") ||
      source.includes("requireSupportAdmin") ||
      source.includes("isCurrentUserSupportAdmin") ||
      source.includes("auth()");

    if (!protectedRoute && !file.includes("/health/")) {
      unprotected++;
      console.log(`[AVISO] API sem proteção detectada: ${relative(".", file)}`);
    }

    console.log(
      `${relative(".", file)} -> ${
        found.length ? found.join(", ") : "NENHUM HANDLER"
      }`,
    );

    if (found.length === 0) {
      failures++;
    }
  }

  console.log(`\nRotas: ${files.length}`);
  console.log(`Handlers: ${handlers}`);

  if (unprotected > 0) {
    warnings += unprotected;
  }

  console.log(
    unprotected === 0
      ? "[OK] APIs possuem proteção detectável."
      : `[AVISO] ${unprotected} API(s) sem proteção detectável.`,
  );
}

console.log("=================================");
console.log("       ESTETIQI DIAGNOSTIC");
console.log("=================================");

run("TypeScript", "npx tsc --noEmit");
run("ESLint", "npm run lint");
run("Next Build", "npm run build");

checkApiStructure();

console.log("\n=================================");
console.log("RESULTADO");
console.log("=================================");

if (failures === 0 && warnings === 0) {
  console.log("DIAGNÓSTICO: OK");
} else if (failures === 0) {
  console.log(`DIAGNÓSTICO: OK COM ${warnings} AVISO(S)`);
} else {
  console.log(
    `DIAGNÓSTICO: ${failures} ERRO(S) E ${warnings} AVISO(S)`,
  );
}

process.exitCode = failures ? 1 : 0;
