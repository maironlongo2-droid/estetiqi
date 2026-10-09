import { sql } from "@/lib/db/client";

export type ProcedureRow = {
  id: string;
  // O driver do Postgres devolve colunas NUMERIC como string (para preservar a
  // precisão); duration_minutes é INTEGER e chega como número.
  duration_minutes: number | null;
  price: number | string | null;
};

// Converte um valor do banco em número (NUMERIC costuma chegar como string).
// Retorna null quando vazio ou inválido — nunca NaN.
function toNullableNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Lista de procedimentos do agendamento (na ordem escolhida). Quando o
// agendamento ainda não possui vínculos registrados, cai para o campo único
// antigo `procedure_id`, preservando a compatibilidade.
export function appointmentProceduresSelect() {
  return sql`COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', link_proc.id,
          'name', link_proc.name,
          'price', link_proc.price,
          'durationMinutes', link_proc.duration_minutes
        )
        ORDER BY link.position, link_proc.name
      )
      FROM appointment_procedures link
      JOIN procedures link_proc
        ON link_proc.id = link.procedure_id
        AND link_proc.organization_id = a.organization_id
      WHERE link.appointment_id = a.id
    ),
    CASE
      WHEN a.procedure_id IS NOT NULL THEN
        json_build_array(
          json_build_object(
            'id', p.id,
            'name', p.name,
            'price', p.price,
            'durationMinutes', p.duration_minutes
          )
        )
      ELSE '[]'::json
    END
  )`;
}

// Normaliza os procedimentos recebidos do cliente, aceitando tanto o formato
// antigo (`procedureId`) quanto o novo (`procedureIds`). Remove repetidos.
export function normalizeProcedureIds(data: {
  procedureId?: string | null;
  procedureIds?: string[] | null;
}): string[] {
  if (Array.isArray(data.procedureIds)) {
    return Array.from(new Set(data.procedureIds.filter(Boolean)));
  }
  if (data.procedureId) {
    return [data.procedureId];
  }
  return [];
}

// Busca, valida e totaliza os procedimentos no servidor. Nunca confia nos
// valores calculados pelo navegador.
export async function loadAppointmentProcedures(
  organizationId: string,
  procedureIds: string[],
  options: { requireActive: boolean }
): Promise<
  | {
      ok: true;
      procedures: ProcedureRow[];
      totalDurationMinutes: number | null;
      totalPrice: number | null;
    }
  | { ok: false; status: number; error: string }
> {
  if (procedureIds.length === 0) {
    return {
      ok: true,
      procedures: [],
      totalDurationMinutes: null,
      totalPrice: null,
    };
  }

  const rows = (await sql`
    SELECT id, duration_minutes, price
    FROM procedures
    WHERE organization_id = ${organizationId}
      AND id = ANY(${procedureIds}::uuid[])
      ${options.requireActive ? sql`AND status = 'active'` : sql``}
  `) as ProcedureRow[];

  if (rows.length !== procedureIds.length) {
    return {
      ok: false,
      status: 404,
      error: "Procedimento não encontrado ou inativo.",
    };
  }

  const ordered = procedureIds.map(
    (id) => rows.find((row) => row.id === id) as ProcedureRow
  );

  const durations = ordered.map((row) => toNullableNumber(row.duration_minutes));
  const hasEveryDuration = durations.every(
    (value) => value !== null && value > 0
  );
  const totalDurationMinutes = hasEveryDuration
    ? durations.reduce<number>((sum, value) => sum + (value as number), 0)
    : null;

  // O preço total é sempre recalculado no servidor a partir do cadastro; nunca
  // se confia na soma enviada pelo navegador.
  const prices = ordered.map((row) => toNullableNumber(row.price));
  const totalPrice = prices.some((value) => value !== null)
    ? prices.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;

  return {
    ok: true,
    procedures: ordered,
    totalDurationMinutes,
    totalPrice,
  };
}

// Monta o JSON dos vínculos (procedimento + posição) para gravar em
// `appointment_procedures`.
export function procedureLinksJson(procedureIds: string[]) {
  return JSON.stringify(
    procedureIds.map((id, index) => ({
      procedure_id: id,
      position: index + 1,
    }))
  );
}
