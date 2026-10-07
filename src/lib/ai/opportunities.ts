import { sql } from "@/lib/db/client";
import { generateAI } from "@/lib/ai/gemini";
import { getBusinessMetrics } from "@/lib/analytics/business-metrics";
import { cleanJsonResponse } from "@/lib/ai/json-response";

type AIOpportunity = {
  type: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high";
  suggestedAction: string;
};

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

  let parsed: { opportunities?: AIOpportunity[] };

  try {
    parsed = JSON.parse(cleanJsonResponse(response));
  } catch {
    // Loga a resposta bruta (truncada) para tornar a falha identificável em produção.
    console.error(
      "AI business opportunities: a resposta do Gemini não é um JSON válido.",
      JSON.stringify(response.slice(0, 500)),
    );
    throw new Error("AI_INVALID_JSON");
  }

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
