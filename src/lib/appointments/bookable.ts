import { sql } from "@/lib/db/client";

// Validação reutilizável de uma seleção de agendamento (profissional +
// procedimentos) dentro de uma organização. É a mesma regra usada pela
// consulta de disponibilidade autenticada e pela versão pública, garantindo
// que o fluxo público não contorne as regras atuais.

export type BookableSelectionCode =
  | "PROFESSIONAL_OR_PROCEDURE_NOT_FOUND"
  | "PROCEDURE_NOT_ASSIGNED"
  | "PROCEDURE_DURATION_REQUIRED";

export type BookableSelection =
  | { ok: true; durationMinutes: number }
  | { ok: false; status: number; code: BookableSelectionCode };

export async function resolveBookableSelection(input: {
  organizationId: string;
  professionalId: string;
  procedureIds: string[];
}): Promise<BookableSelection> {
  const { organizationId, professionalId, procedureIds } = input;

  const [professional, procedures, assignments] = await Promise.all([
    sql`
      SELECT id
      FROM professionals
      WHERE id = ${professionalId}
        AND organization_id = ${organizationId}
        AND active = TRUE
      LIMIT 1
    `,
    sql`
      SELECT id, duration_minutes
      FROM procedures
      WHERE organization_id = ${organizationId}
        AND status = 'active'
        AND id = ANY(${procedureIds}::uuid[])
    `,
    sql`
      SELECT procedure_id
      FROM professional_procedures
      WHERE organization_id = ${organizationId}
        AND professional_id = ${professionalId}
        AND procedure_id = ANY(${procedureIds}::uuid[])
    `,
  ]);

  if (!professional.length || procedures.length !== procedureIds.length) {
    return {
      ok: false,
      status: 404,
      code: "PROFESSIONAL_OR_PROCEDURE_NOT_FOUND",
    };
  }

  if (assignments.length !== procedureIds.length) {
    return { ok: false, status: 409, code: "PROCEDURE_NOT_ASSIGNED" };
  }

  // A agenda precisa reservar a soma das durações de todos os procedimentos.
  const hasEveryDuration = procedures.every(
    (procedure) =>
      typeof procedure.duration_minutes === "number" &&
      procedure.duration_minutes > 0
  );
  if (!hasEveryDuration) {
    return { ok: false, status: 409, code: "PROCEDURE_DURATION_REQUIRED" };
  }

  const durationMinutes = procedures.reduce(
    (total, procedure) => total + procedure.duration_minutes,
    0
  );

  return { ok: true, durationMinutes };
}
