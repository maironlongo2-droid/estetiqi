import { sql } from "@/lib/db/client";
import { generateAI } from "@/lib/ai/gemini";
import { getBusinessContext } from "@/lib/ai/context/business-context";

type Opportunity = {
  type: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  suggestedAction: string;
  target: {
    type: "business" | "professional" | "service" | "customer_segment";
    id?: string | null;
    name?: string | null;
  };
};

export async function analyzeBusiness(organizationId: string) {
  const context = await getBusinessContext(organizationId);

  const prompt = `
Você é o AI Engine do EstetiQI.

Sua função é analisar o negócio de forma personalizada e identificar oportunidades práticas.

Não seja um assistente genérico. Entenda o contexto específico do negócio antes de recomendar qualquer ação.

CONTEXTO DO NEGÓCIO:
${JSON.stringify(context)}

Analise principalmente:

- tipo e localização do negócio;
- profissionais e desempenho individual;
- serviços oferecidos, preços, duração e faturamento;
- agenda, atendimentos, cancelamentos e no-shows;
- clientes ativos e inativos;
- receita atual e comparação com o período anterior;
- ticket médio;
- relações entre serviços, profissionais, agenda e receita.

Procure situações como:

- serviços com baixa utilização ou oportunidade de crescimento;
- profissionais com capacidade ou desempenho que mereça atenção;
- horários ou agenda que possam ser melhor aproveitados;
- queda ou aumento relevante de receita;
- oportunidades de aumentar ticket;
- oportunidades de reativação ou retenção;
- problemas operacionais;
- oportunidades específicas para o tipo de negócio.

IMPORTANTE:
- Não invente dados.
- Não faça previsões garantidas.
- Não recomende algo apenas porque é uma prática genérica de marketing.
- Toda oportunidade deve estar baseada em algum dado do contexto.
- Seja específico para este negócio.
- Evite repetir oportunidades equivalentes.
- Máximo de 5 oportunidades.
- Se não houver oportunidade clara, retorne uma lista vazia.

Retorne SOMENTE JSON válido neste formato:

{
  "opportunities": [
    {
      "type": "string",
      "title": "string",
      "description": "string",
      "priority": "low|medium|high",
      "suggestedAction": "string",
      "target": {
        "type": "business|professional|service|customer_segment",
        "id": "string ou null",
        "name": "string ou null"
      }
    }
  ]
}
`;

  const response = await generateAI(prompt);

  const cleaned = response
    .replace(/^```json\\s*/i, "")
    .replace(/^```\\s*/i, "")
    .replace(/\\s*```$/i, "")
    .trim();

  let parsed: { opportunities?: Opportunity[] };

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI_INVALID_JSON");
  }

  const opportunities = Array.isArray(parsed.opportunities)
    ? parsed.opportunities
        .filter(
          (item) =>
            item &&
            typeof item.title === "string" &&
            typeof item.description === "string" &&
            ["low", "medium", "high"].includes(item.priority) &&
            item.target &&
            [
              "business",
              "professional",
              "service",
              "customer_segment",
            ].includes(item.target.type)
        )
        .slice(0, 5)
    : [];

  for (const opportunity of opportunities) {
    await sql`
      INSERT INTO ai_opportunities (
        organization_id,
        type,
        title,
        description,
        priority,
        status,
        data
      )
      VALUES (
        ${organizationId},
        ${opportunity.type || "business"},
        ${opportunity.title.slice(0, 180)},
        ${opportunity.description},
        ${opportunity.priority},
        'open',
        ${JSON.stringify({
          suggestedAction: opportunity.suggestedAction || null,
          target: opportunity.target,
          generatedBy: "business-context-analysis"
        })}::jsonb
      )
    `;
  }

  return {
    context,
    opportunities,
  };
}
