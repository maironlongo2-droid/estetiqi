// Utilitários de erro do PostgreSQL compartilhados entre as rotas.
//
// O driver serverless pode expor o código SQLSTATE, a mensagem ou ambos.
// Concentrar a detecção aqui mantém o mesmo critério em todas as rotas e evita
// transformar falhas previsíveis do banco (como colisão de unicidade) em um
// HTTP 500 inesperado.

// Violação de unicidade (SQLSTATE 23505).
export function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  if (candidate?.code === "23505") return true;
  if (
    typeof candidate?.message === "string" &&
    candidate.message.includes("duplicate key")
  ) {
    return true;
  }
  return false;
}
