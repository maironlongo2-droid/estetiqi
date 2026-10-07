type MessageResponse = {
  message?: unknown;
  error?: unknown;
};

export async function requestSuggestedMessage(opportunityId: string) {
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

  return data.message.trim();
}
