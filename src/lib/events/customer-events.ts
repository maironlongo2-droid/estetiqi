import { sql } from "@/lib/db/client";

export async function recordCustomerEvent(input: {
  organizationId: string;
  clientId?: string | null;
  appointmentId?: string | null;
  paymentId?: string | null;
  eventType: string;
  source?: string;
  data?: Record<string, unknown>;
}) {
  await sql`
    INSERT INTO customer_events (
      organization_id,
      client_id,
      appointment_id,
      payment_id,
      event_type,
      source,
      data
    )
    VALUES (
      ${input.organizationId},
      ${input.clientId ?? null},
      ${input.appointmentId ?? null},
      ${input.paymentId ?? null},
      ${input.eventType},
      ${input.source ?? "system"},
      ${JSON.stringify(input.data ?? {})}::jsonb
    )
  `;
}
