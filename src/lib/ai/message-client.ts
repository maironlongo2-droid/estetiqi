type MessageResponse = {
  message?: unknown;
  fallback?: unknown;
  error?: unknown;
};

export type SuggestedMessage = {
  message: string;
  /** true quando a mensagem é a sugestão-padrão usada com a IA indisponível. */
  fallback: boolean;
};

export async function requestSuggestedMessage(
  opportunityId: string
): Promise<SuggestedMessage> {
  const response = await fetch(
    `/api/ai/opportunities/${opportunityId}/message`,
    { method: "POST" }
  );

  let data: MessageResponse | null = null;
  try {
    data = (await response.json()) as MessageResponse;
  } catch {
    throw new Error(
      response.ok
        ? "O servidor retornou uma resposta inválida ao gerar a mensagem."
        : "Não foi possível gerar a mensagem agora. Tente novamente."
    );
  }

  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : "Não foi possível gerar a mensagem agora. Tente novamente."
    );
  }

  if (
    typeof data?.message !== "string" ||
    !data.message.trim() ||
    data.message.length > 500
  ) {
    throw new Error("A IA não retornou uma mensagem curta utilizável. Tente novamente.");
  }

  return {
    message: data.message.trim(),
    fallback: data.fallback === true,
  };
}
