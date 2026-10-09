// Regras do endereço público do cartão digital (/agendar/<slug>).

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Endereços reservados que colidiriam com rotas internas da aplicação.
const RESERVED_SLUGS = new Set([
  "app",
  "admin",
  "api",
  "login",
  "cadastro",
  "agendar",
  "suporte",
  "configuracoes",
]);

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function isValidPublicSlug(value: string): boolean {
  if (value.length < 3 || value.length > 60) return false;
  if (!SLUG_PATTERN.test(value)) return false;
  return !RESERVED_SLUGS.has(value);
}
