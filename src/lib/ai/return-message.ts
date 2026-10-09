/**
 * Mensagem-padrão de reativação usada quando a IA (Gemini) não está
 * disponível ou falha ao gerar a sugestão.
 *
 * Monta o texto apenas com dados reais já conhecidos no sistema — o
 * primeiro nome da cliente e o último procedimento — sem inventar preços,
 * descontos, procedimentos ou promessas comerciais. É a última linha de
 * defesa para que a profissional ainda consiga revisar e abrir o WhatsApp.
 */
export function buildDefaultReturnMessage(input: {
  name?: string | null;
  lastProcedureName?: string | null;
}) {
  const firstName = input.name?.trim().split(/\s+/)[0] || "tudo bem";
  const procedureName = input.lastProcedureName?.trim() || "seu procedimento";

  return `Oi, ${firstName}! Tudo bem? Gostaria de conversar sobre seu retorno para ${procedureName} e verificar um horário que funcione para você.`;
}
