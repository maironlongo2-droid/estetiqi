import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Arquivos de apoio/temporários da raiz (`*.tmp_*`, `.tmp_*`): são rascunhos
    // locais de diagnóstico, não fazem parte do produto e não devem ser apagados,
    // por isso ficam fora da verificação do código da aplicação.
    ".tmp_*",
  ]),
]);

export default eslintConfig;
