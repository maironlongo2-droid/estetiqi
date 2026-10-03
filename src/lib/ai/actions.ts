import { sql } from "@/lib/db/client";

export type CreateAIActionInput = {
  organizationId: string;
  opportunityId?: string | null;
  clientId?: string | null;
  type: string;
  payload?: Record<string, unknown>;
};

export async function createAIAction(input: CreateAIActionInput) {
  const result = await sql`
    INSERT INTO ai_actions (
      organization_id,
      opportunity_id,
      client_id,
      type,
      status,
      payload
    )
    VALUES (
      ${input.organizationId},
      ${input.opportunityId ?? null},
      ${input.clientId ?? null},
      ${input.type},
      'pending_approval',
      ${JSON.stringify(input.payload ?? {})}::jsonb
    )
    RETURNING
      id,
      organization_id,
      opportunity_id,
      client_id,
      type,
      status,
      payload,
      created_at,
      updated_at
  `;

  return result[0];
}
