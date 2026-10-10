// Cor de destaque do cartão digital público.
//
// O banco guarda apenas a CHAVE escolhida dentro de um conjunto FECHADO de seis
// cores — nunca CSS, nunca valor hexadecimal arbitrário. Os valores visuais vivem
// aqui e são aplicados na página pública como variáveis CSS (`data-accent`), o que
// impede que um valor gravado no banco injete estilo livre na página.
//
// As cores são suaves (baixa saturação, tom claro) para não pesar no cartão,
// mas continuam escuras o suficiente para carregar texto branco.
//
// CONTRASTE (WCAG 2.1 — relação real medida com as seis cores atuais):
// - texto branco (#ffffff) sobre a cor base: 4,82:1 (rosé) a 5,84:1 (petróleo),
//   acima do mínimo de 4,5:1 para texto normal e de 3:1 para texto grande/ícones.
// - cor base como texto sobre fundo claro (#ffffff): 4,82:1 (rosé) a 5,84:1.
// - texto branco sobre a variante de interação (`strong`): 6,31:1 a 7,63:1.
// Por isso o modelo usa texto branco sobre a cor de destaque e a cor de destaque
// como texto apenas sobre fundos claros (`--eq-soft`) ou sobre o fundo escuro
// clareado (`--eq-accent-text`, definido no CSS para o modo escuro).
// O mesmo degrau de contraste é revalidado em tests/unit/public-accent.test.ts,
// que mede estas relações em vez de confiar no comentário.

export const PUBLIC_ACCENT_KEYS = [
  "petroleo",
  "salvia",
  "rose",
  "ameixa",
  "azul",
  "bronze",
] as const;

export type PublicAccent = (typeof PUBLIC_ACCENT_KEYS)[number];

// Padrão do aplicativo quando a clínica ainda não escolheu (ou quando o valor
// gravado é inválido).
export const DEFAULT_PUBLIC_ACCENT: PublicAccent = "petroleo";

export const PUBLIC_ACCENT_LABELS: Record<PublicAccent, string> = {
  petroleo: "Petróleo",
  salvia: "Sálvia",
  rose: "Rosé",
  ameixa: "Ameixa",
  azul: "Azul",
  bronze: "Bronze",
};

// Valores usados pela interface administrativa (amostra de cor e texto de
// apoio) e pela página pública, que recebe a mesma paleta via `data-accent` em
// globals.css. `base` é sempre a cor oficial da paleta; `strong` é a variante de
// interação (hover/ativo). Ao mudar um valor aqui, mude também o bloco
// correspondente em globals.css — tests/unit/public-card-style.test.ts compara os
// dois lados e falha se eles divergirem.
export const PUBLIC_ACCENT_SWATCHES: {
  key: PublicAccent;
  label: string;
  base: string;
  strong: string;
}[] = [
  { key: "petroleo", label: "Petróleo", base: "#2f6f68", strong: "#275c56" },
  { key: "salvia", label: "Sálvia", base: "#4f7a5c", strong: "#41674c" },
  { key: "rose", label: "Rosé", base: "#af5570", strong: "#93485e" },
  { key: "ameixa", label: "Ameixa", base: "#7c5a8e", strong: "#684b78" },
  { key: "azul", label: "Azul", base: "#3f6a8c", strong: "#355a76" },
  { key: "bronze", label: "Bronze", base: "#876738", strong: "#71562f" },
];

// Normaliza qualquer valor vindo do banco (ou do navegador) para uma chave
// permitida. Valor ausente ou inválido usa o padrão do aplicativo.
export function resolvePublicAccent(value: unknown): PublicAccent {
  return typeof value === "string" &&
    (PUBLIC_ACCENT_KEYS as readonly string[]).includes(value)
    ? (value as PublicAccent)
    : DEFAULT_PUBLIC_ACCENT;
}

export function isPublicAccent(value: unknown): value is PublicAccent {
  return (
    typeof value === "string" &&
    (PUBLIC_ACCENT_KEYS as readonly string[]).includes(value)
  );
}
