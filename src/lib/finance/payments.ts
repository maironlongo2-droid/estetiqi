import { sql } from "@/lib/db/client";

export type CreatePaymentInput = {
  organizationId: string;
  clientId: string;
  appointmentId?: string | null;
  procedureId?: string | null;
  amount: number;
  paymentMethod?: string | null;
  status?: "pending" | "paid" | "cancelled" | "refunded";
  paidAt?: string | null;
  notes?: string | null;
};

export async function createPayment(input: CreatePaymentInput) {
  const status = input.status ?? "paid";

  const result = await sql`
    INSERT INTO payments (
      organization_id,
      client_id,
      appointment_id,
      procedure_id,
      amount,
      payment_method,
      status,
      paid_at,
      notes
    )
    VALUES (
      ${input.organizationId},
      ${input.clientId},
      ${input.appointmentId ?? null},
      ${input.procedureId ?? null},
      ${input.amount},
      ${input.paymentMethod ?? null},
      ${status},
      ${input.paidAt ? new Date(input.paidAt) : status === "paid" ? new Date() : null},
      ${input.notes ?? null}
    )
    RETURNING
      id,
      organization_id,
      client_id,
      appointment_id,
      procedure_id,
      amount,
      payment_method,
      status,
      paid_at,
      notes,
      created_at
  `;

  const payment = result[0];

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
      ${input.clientId},
      ${input.appointmentId ?? null},
      ${payment.id},
      ${status === "paid" ? "payment.paid" : `payment.${status}`},
      'system',
      ${JSON.stringify({
        amount: input.amount,
        paymentMethod: input.paymentMethod ?? null,
        procedureId: input.procedureId ?? null
      })}::jsonb
    )
  `;

  return payment;
}
