import { hasPermission } from "@/lib/auth/authorization";
import { requireCurrentUser } from "@/lib/auth/require-current-user";
import { sql } from "@/lib/db/client";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const currentUser = await requireCurrentUser();
    if (!hasPermission(currentUser.role, "appointments", "read")) {
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    }

    const { id } = await params;
    const organizationId = currentUser.organization.id;
    const professional = await sql`
      SELECT id, name
      FROM professionals
      WHERE id = ${id}
        AND organization_id = ${organizationId}
      LIMIT 1
    `;
    if (professional.length === 0) {
      return Response.json({ error: "PROFESSIONAL_NOT_FOUND" }, { status: 404 });
    }

    const appointments = await sql`
      SELECT
        appointment.id,
        appointment.starts_at,
        appointment.ends_at,
        appointment.status,
        appointment.price,
        appointment.professional_name,
        client.name AS client_name,
        pr.name AS procedure_name,
        COUNT(*) OVER()::int AS total_count
      FROM appointments appointment
      JOIN clients client
        ON client.id = appointment.client_id
        AND client.organization_id = appointment.organization_id
      LEFT JOIN procedures pr
        ON pr.id = appointment.procedure_id
        AND pr.organization_id = appointment.organization_id
      WHERE appointment.organization_id = ${organizationId}
        AND (
          appointment.professional_id = ${id}
          OR (
            appointment.professional_id IS NULL
            AND appointment.professional_name = ${professional[0].name}
          )
        )
      ORDER BY appointment.starts_at DESC, appointment.id DESC
      LIMIT 50
    `;

    return Response.json({
      appointments,
      total: appointments.length ? appointments[0].total_count : 0,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORGANIZATION_BLOCKED") {
      return Response.json({ error: "A organização está bloqueada. Fale com o suporte da EstetiQI." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    console.error("List professional history error:", error);
    return Response.json({ error: "Não foi possível carregar o histórico." }, { status: 500 });
  }
}
