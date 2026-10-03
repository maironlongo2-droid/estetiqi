import { z } from "zod";
import { sql } from "@/lib/db/client";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { hasPermission } from "@/lib/auth/authorization";
import { createPayment } from "@/lib/finance/payments";

const paymentSchema = z.object({
  clientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional().or(z.literal("")),
  procedureId: z.string().uuid().optional().or(z.literal("")),
  amount: z.number().min(0),
  paymentMethod: z
    .enum(["pix", "credito", "debito", "dinheiro"])
    .optional()
    .default("pix"),
  status: z.enum(["pending", "paid", "cancelled", "refunded"]).optional(),
  paidAt: z.string().datetime().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function GET() {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "finance", "read")) {
      return Response.json(
        { error: "Você não tem permissão para visualizar o financeiro." },
        { status: 403 },
      );
    }

    const result = await sql`
    SELECT
      p.id,
      p.client_id,
      c.name AS client_name,
      p.appointment_id,
      p.procedure_id,
      pr.name AS procedure_name,
      p.amount,
      p.payment_method,
      p.status,
      p.paid_at,
      p.notes,
      p.created_at
    FROM payments p
    JOIN clients c
      ON c.id = p.client_id
      AND c.organization_id = p.organization_id
    LEFT JOIN procedures pr
      ON pr.id = p.procedure_id
      AND pr.organization_id = p.organization_id
    WHERE p.organization_id = ${currentUser.organization.id}
    ORDER BY COALESCE(p.paid_at, p.created_at) DESC
    LIMIT 100
  `;

    return Response.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("List payments error:", error);

    return Response.json(
      { error: "Não foi possível listar os pagamentos." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireCurrentUser();

    if (!hasPermission(currentUser.role, "finance", "create")) {
      return Response.json(
        { error: "Você não tem permissão para registrar pagamentos." },
        { status: 403 },
      );
    }

    const body = await request.json();
    const parsed = paymentSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "INVALID_DATA", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const client = await sql`
    SELECT id
    FROM clients
    WHERE id = ${data.clientId}
      AND organization_id = ${currentUser.organization.id}
    LIMIT 1
  `;

    if (client.length === 0) {
      return Response.json({ error: "CLIENT_NOT_FOUND" }, { status: 404 });
    }

    if (data.procedureId) {
      const procedure = await sql`
      SELECT id
      FROM procedures
      WHERE id = ${data.procedureId}
        AND organization_id = ${currentUser.organization.id}
      LIMIT 1
    `;

      if (procedure.length === 0) {
        return Response.json({ error: "PROCEDURE_NOT_FOUND" }, { status: 404 });
      }
    }

    if (data.appointmentId) {
      const appointment = await sql`
      SELECT id
      FROM appointments
      WHERE id = ${data.appointmentId}
        AND organization_id = ${currentUser.organization.id}
      LIMIT 1
    `;

      if (appointment.length === 0) {
        return Response.json(
          { error: "APPOINTMENT_NOT_FOUND" },
          { status: 404 },
        );
      }
    }

    const payment = await createPayment({
      organizationId: currentUser.organization.id,
      clientId: data.clientId,
      appointmentId: data.appointmentId || null,
      procedureId: data.procedureId || null,
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      status: data.status,
      paidAt: data.paidAt || null,
      notes: data.notes || null,
    });

    return Response.json(payment, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }

    console.error("Create payment error:", error);

    return Response.json(
      { error: "Não foi possível registrar o pagamento." },
      { status: 500 },
    );
  }
}
