import { generateAI } from "@/lib/ai/gemini";

export type InactiveClient = {
  id: string;
  name: string;
  last_appointment_at: string;
  inactive_days: number;
};

export type InactiveClientsBusinessContext = {
  businessType?: string | null;
};

export async function analyzeInactiveClients(
  clients: InactiveClient[],
  days: number,
  business?: InactiveClientsBusinessContext
) {
  if (clients.length === 0) {
    return "Nenhum cliente inativo foi encontrado.";
  }

  // Contexto mínimo do negócio: o tipo de atuação orienta o vocabulário da
  // análise. Quando não informado, a IA é instruída a usar linguagem neutra,
  // válida para qualquer negócio de serviços.
  const businessType =
    typeof business?.businessType === "string" && business.businessType.trim()
      ? business.businessType.trim().slice(0, 80)
      : "não informado";

  const prompt = `
Você é o AI Engine do EstetiQI, um sistema de inteligência para negócios de serviços.

Analise os clientes abaixo.

Tipo de negócio: ${businessType}
Período de inatividade: ${days} dias.

DADOS:
${JSON.stringify(clients)}

Retorne uma análise objetiva em português do Brasil contendo:

1. Resumo do cenário.
2. Clientes que merecem atenção primeiro e por quê.
3. Estratégia de reativação.
4. Uma mensagem curta que poderia ser enviada ao cliente.
5. Próxima ação recomendada.

Regras:
- Não invente informações.
- Use somente os dados fornecidos.
- Adeque o vocabulário ao tipo de negócio informado. Se ele não estiver informado, use linguagem neutra, válida para qualquer negócio de serviços. Estética e beleza são apenas um dos segmentos possíveis.
- Não envie mensagens.
- Apenas analise e recomende.
`;

  return generateAI(prompt);
}
