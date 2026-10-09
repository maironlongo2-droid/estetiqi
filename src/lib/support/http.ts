// Respostas de erro padronizadas para as rotas de suporte, seguindo os códigos
// esperados pelo projeto: 401 não autenticado, 403 sem permissão, 404 recurso
// inexistente/fora do escopo do usuário e 500 erro inesperado real.
export function supportErrorResponse(
  error: unknown,
  serverMessage: string
): Response {
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (error instanceof Error && error.message === "FORBIDDEN") {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }

  console.error(serverMessage, error);

  return Response.json({ error: serverMessage }, { status: 500 });
}
