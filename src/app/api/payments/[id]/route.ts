import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";

const paymentUpdateSchema = z
  .object({
    amount: z.number().min(0).optional(),
    paymentMethod: z
      .enum(["pix", "credito", "debito", "dinheiro"])
      .optional(),
    status: z.enum(["pending", "paid", "cancelled", "refunded"]).optional(),
    paidAt: z.string().datetime().optional().or(z.literal("")),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "Nenhum campo para atualizar.",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "finance", "update")) {
      return Response.json(
        { error: "Você não tem permissão para editar pagamentos." },
        { status: 403 },
      );
    }

    const { id } = await params;

    const existingPayment = await sql`
      SELECT
        id,
        organization_id,
        appointment_id,
        client_id,
        amount,
        payment_method,
        status,
        paid_at,
        notes
      FROM payments
      WHERE id = ${id}
        AND organization_id = ${currentUser.organization.id}
      LIMIT 1
    `;

    // A consulta já é limitada à organização: pagamento inexistente ou de
    // outra organização resulta em 404, sem revelar dados de terceiros.
    if (existingPayment.length === 0) {
      return Response.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = paymentUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "INVALID_DATA", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const current = existingPayment[0];

    // PATCH parcial: campos omitidos preservam o valor atual.
    const nextAmount =
      data.amount !== undefined ? data.amount : Number(current.amount);
    const nextPaymentMethod =
      data.paymentMethod !== undefined
        ? data.paymentMethod
        : current.payment_method;
    const nextStatus = data.status !== undefined ? data.status : current.status;
    const nextNotes =
      data.notes !== undefined ? data.notes || null : current.notes;

    // paid_at acompanha o status resultante: só existe quando o pagamento está
    // pago; ao voltar para pago, preserva a data anterior ou marca agora.
    const nextPaidAt =
      data.paidAt !== undefined && data.paidAt !== ""
        ? new Date(data.paidAt)
        : nextStatus === "paid"
          ? current.paid_at
            ? new Date(current.paid_at)
            : new Date()
          : null;

    const result = await sql`
      UPDATE payments
      SET
        amount = ${nextAmount},
        payment_method = ${nextPaymentMethod},
        status = ${nextStatus},
        paid_at = ${nextPaidAt},
        notes = ${nextNotes},
        updated_at = NOW()
      WHERE id = ${id}
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
        created_at,
        updated_at
    `;

    const updated = result[0];

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
        ${updated.organization_id},
        ${updated.client_id},
        ${updated.appointment_id ?? null},
        ${updated.id},
        'payment.updated',
        'system',
        ${JSON.stringify({
          previousStatus: current.status,
          newStatus: updated.status,
          amount: Number(updated.amount),
          paymentMethod: updated.payment_method ?? null,
        })}::jsonb
      )
    `;

    return Response.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Update payment error:", error);

    return Response.json(
      { error: "Não foi possível atualizar o pagamento." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "finance", "create")) {
      return Response.json(
        { error: "Você não tem permissão para deletar pagamentos." },
        { status: 403 },
      );
    }

    const { id } = await params;

    const existingPayment = await sql`
      SELECT id, organization_id, appointment_id, client_id
      FROM payments
      WHERE id = ${id}
        AND organization_id = ${currentUser.organization.id}
      LIMIT 1
    `;

    if (existingPayment.length === 0) {
      return Response.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });
    }

    await sql`
      DELETE FROM customer_events
      WHERE payment_id = ${id}
    `;

    await sql`
      DELETE FROM payments
      WHERE id = ${id}
    `;

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Delete payment error:", error);

    return Response.json(
      { error: "Não foi possível deletar o pagamento." },
      { status: 500 },
    );
  }
}
