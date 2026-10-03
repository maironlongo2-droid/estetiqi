import { sql } from "@/lib/db/client";

export async function executeAIAction(actionId: string, organizationId: string) {
  const result = await sql`
    UPDATE ai_actions
    SET status = 'running', updated_at = NOW()
    WHERE id = ${actionId}
      AND organization_id = ${organizationId}
      AND status = 'approved'
    RETURNING id, organization_id, opportunity_id, client_id, type, payload
  `;

  if (result.length === 0) {
    throw new Error("ACTION_NOT_APPROVED");
  }

  const action = result[0];
  const webhookUrl = process.env.ACTIVEPIECES_WEBHOOK_URL;

  if (!webhookUrl) {
    await sql`
      UPDATE ai_actions
      SET
        status = 'failed',
        result = ${JSON.stringify({
          error: "ACTIVEPIECES_WEBHOOK_URL_NOT_CONFIGURED",
        })}::jsonb,
        updated_at = NOW()
      WHERE id = ${action.id}
        AND organization_id = ${organizationId}
    `;

    throw new Error("ACTIVEPIECES_WEBHOOK_URL_NOT_CONFIGURED");
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        actionId: action.id,
        organizationId: action.organization_id,
        opportunityId: action.opportunity_id,
        clientId: action.client_id,
        type: action.type,
        payload: action.payload,
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`ACTIVEPIECES_ERROR_${response.status}`);
    }

    const executionResult = {
      sent: true,
      response: responseText.slice(0, 5000),
    };

    await sql`
      UPDATE ai_actions
      SET
        status = 'completed',
        result = ${JSON.stringify(executionResult)}::jsonb,
        executed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${action.id}
        AND organization_id = ${organizationId}
    `;

    return executionResult;
  } catch (error) {
    await sql`
      UPDATE ai_actions
      SET
        status = 'failed',
        result = ${JSON.stringify({
          error:
            error instanceof Error
              ? error.message
              : "EXECUTION_FAILED",
        })}::jsonb,
        updated_at = NOW()
      WHERE id = ${action.id}
        AND organization_id = ${organizationId}
    `;

    throw error;
  }
}
