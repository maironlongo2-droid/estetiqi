// Rótulos de apresentação das ofertas do negócio ("procedimentos" x "serviços").
//
// A decisão fica centralizada aqui para evitar regras divergentes espalhadas
// pelos componentes. O vocabulário interno permanece inalterado (procedures,
// appointment_procedures, /api/procedures, /app/procedimentos) — apenas o texto
// exibido muda conforme o segmento da organização.
//
// Regra:
// - Negócios de estética ("estética", "esteticista"...) mantêm "Procedimento(s)".
// - Demais segmentos de serviços (salão, barbearia, etc.) usam "Serviço(s)".
// - Tipos de negócio vazios ou desconhecidos usam o fallback neutro "Serviço(s)".

export type ProcedureLabels = {
  /** Ex.: "Procedimento" / "Serviço" */
  singular: string;
  /** Ex.: "Procedimentos" / "Serviços" */
  plural: string;
  /** Ex.: "procedimento" / "serviço" */
  singularLower: string;
  /** Ex.: "procedimentos" / "serviços" */
  pluralLower: string;
};

const AESTHETICS_LABELS: ProcedureLabels = {
  singular: "Procedimento",
  plural: "Procedimentos",
  singularLower: "procedimento",
  pluralLower: "procedimentos",
};

const SERVICE_LABELS: ProcedureLabels = {
  singular: "Serviço",
  plural: "Serviços",
  singularLower: "serviço",
  pluralLower: "serviços",
};

// Remove acentos e normaliza para comparação por segmento de forma tolerante
// ("Estética", "estetica", "ESTÉTICA" e "Clínica de estética").
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function getProcedureLabels(
  businessType?: string | null
): ProcedureLabels {
  if (
    typeof businessType === "string" &&
    normalize(businessType).includes("estetic")
  ) {
    return AESTHETICS_LABELS;
  }

  return SERVICE_LABELS;
}
