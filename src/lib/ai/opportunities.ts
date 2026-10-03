import { sql } from "@/lib/db/client";
import { generateAI } from "@/lib/ai/gemini";
import { getBusinessMetrics } from "@/lib/analytics/business-metrics";

type AIOpportunity = {
  type: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  suggestedAction: string;
};

function cleanJson(text: string) {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export async function generateBusinessOpportunities(
  organizationId: string
) {
  const metrics = await getBusinessMetrics(organizationId);

  const prompt = `
Você é o motor de inteligência do EstetiQI.

Analise os indicadores do negócio abaixo e identifique SOMENTE oportunidades
que possam gerar uma ação prática.

DADOS:
${JSON.stringify(metrics)}

Retorne SOMENTE um JSON válido no formato:

{
  "opportunities": [
    {
      "type": "string",
      "title": "string",
      "description": "string",
      "priority": "low|medium|high",
      "suggestedAction": "string"
    }
  ]
}

Regras:
- Máximo de 5 oportunidades.
- Não invente dados.
- Use somente os dados fornecidos.
- Não faça previsões garantidas.
- Não repita oportunidades equivalentes.
- Priorize ações práticas.
- Se não houver oportunidade clara, retorne uma lista vazia.
`;

  const response = await generateAI(prompt);
  const parsed = JSON.parse(cleanJson(response));

  const opportunities: AIOpportunity[] = Array.isArray(parsed.opportunities)
    ? parsed.opportunities
        .filter(
          (item: AIOpportunity) =>
            item &&
            typeof item.title === "string" &&
            typeof item.description === "string" &&
            ["low", "medium", "high"].includes(item.priority)
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
          generatedBy: "business-analysis",
        })}::jsonb
      )
    `;
  }

  return {
    metrics,
    opportunities,
  };
}
