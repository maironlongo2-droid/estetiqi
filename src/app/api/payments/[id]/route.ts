import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";

const paymentUpdateSchema = z.object({
  amount: z.number().min(0),
  paymentMethod: z
    .enum(["pix", "credito", "debito", "dinheiro"])
    .optional(),
  status: z.enum(["pending", "paid", "cancelled", "refunded"]).optional(),
  paidAt: z.string().datetime().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "finance", "create")) {
      return Response.json(
        { error: "Você não tem permissão para editar pagamentos." },
        { status: 403 },
      );
    }

    const { id } = await params;

    const existingPayment = await sql`
      SELECT id, organization_id, appointment_id
      FROM payments
      WHERE id = ${id}
      LIMIT 1
    `;

    if (existingPayment.length === 0) {
      return Response.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });
    }

    if (existingPayment[0].organization_id !== currentUser.organization.id) {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 403 });
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

    const result = await sql`
      UPDATE payments
      SET
        amount = ${data.amount},
        payment_method = ${data.paymentMethod ?? null},
        status = ${data.status ?? "paid"},
        paid_at = ${data.paidAt ? new Date(data.paidAt) : data.status === "paid" ? new Date() : null},
        notes = ${data.notes ?? null},
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
          amount: data.amount,
          paymentMethod: data.paymentMethod ?? null,
        })}::jsonb
      )
    `;

    return Response.json(updated);
  } catch (error) {
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
      LIMIT 1
    `;

    if (existingPayment.length === 0) {
      return Response.json({ error: "PAYMENT_NOT_FOUND" }, { status: 404 });
    }

    if (existingPayment[0].organization_id !== currentUser.organization.id) {
      return Response.json({ error: "UNAUTHORIZED" }, { status: 403 });
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
