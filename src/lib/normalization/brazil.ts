export function normalizePhone(phone?: string | null) {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  // Telefone brasileiro já com código do país.
  if (digits.startsWith("55")) {
    return `+${digits}`;
  }

  // Telefone brasileiro sem código do país.
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Mantém outros formatos numéricos para futura compatibilidade.
  return `+${digits}`;
}

export function normalizeCpf(cpf?: string | null) {
  if (!cpf) {
    return null;
  }

  const digits = cpf.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  return digits;
}