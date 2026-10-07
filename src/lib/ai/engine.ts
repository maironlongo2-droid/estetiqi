import { generateAI } from "@/lib/ai/gemini";

export type InactiveClient = {
  id: string;
  name: string;
  last_appointment_at: string;
  inactive_days: number;
};

export async function analyzeInactiveClients(
  clients: InactiveClient[],
  days: number
) {
  if (clients.length === 0) {
    return "Nenhum cliente inativo foi encontrado.";
  }

  const prompt = `
Você é o AI Engine do EstetiQI, um sistema de inteligência para negócios de beleza.

Analise os clientes abaixo.

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
- Não envie mensagens.
- Apenas analise e recomende.
`;

  return generateAI(prompt);
}
