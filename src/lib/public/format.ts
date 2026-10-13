// Formatação de apresentação do cartão digital público (preço e duração).
//
// O mesmo texto precisa ser idêntico na lista pública de serviços e no
// formulário de agendamento — o visitante vê os dois na MESMA página. Centralizar
// aqui evita que as duas telas divirjam com o tempo, pela mesma razão de
// src/lib/business/procedure-labels.ts.
//
// Regra de produto: valor ausente devolve `null` e a interface OMITE a
// informação. O cartão nunca inventa "R$ 0,00" nem uma duração que não existe.
// Sem I/O e sem dependência nova: apenas Intl, já usado no restante do projeto.

// Preço em reais no padrão brasileiro (vírgula decimal, ponto de milhar).
export function formatBrlPrice(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// Duração cadastrada (em minutos). Sem duração, zero, negativa ou não numérica
// devolve `null`: nesse caso a interface mostra "duração a combinar".
export function formatDurationMinutes(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return `${value} min`;
}
