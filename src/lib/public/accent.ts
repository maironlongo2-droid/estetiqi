// Cor de destaque do cartão digital público.
//
// O banco guarda apenas a CHAVE escolhida dentro de um conjunto FECHADO de seis
// cores — nunca CSS, nunca valor hexadecimal arbitrário. Os valores visuais vivem
// aqui e são aplicados na página pública como variáveis CSS (`data-accent`), o que
// impede que um valor gravado no banco injete estilo livre na página.
//
// CONTRASTE (WCAG 2.1 — relação real medida com as seis cores):
// - texto branco (#ffffff) sobre a cor base: 5,72:1 (bronze) a 7,60:1 (ameixa),
//   acima do mínimo de 4,5:1 para texto normal e de 3:1 para texto grande/ícones.
// - cor base como texto sobre fundo claro (#ffffff): 5,48:1 (bronze) a 7,60:1.
// Por isso o modelo usa texto branco sobre a cor de destaque e a cor de destaque
// como texto apenas sobre fundos claros (`--eq-soft`) ou sobre o fundo escuro
// clareado (`--eq-accent-text`, definido no CSS para o modo escuro).

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
// apoio). `base` é sempre a cor oficial da paleta; `strong` é a variante de
// interação (hover/ativo).
export const PUBLIC_ACCENT_SWATCHES: {
  key: PublicAccent;
  label: string;
  base: string;
  strong: string;
}[] = [
  { key: "petroleo", label: "Petróleo", base: "#0f5f59", strong: "#0b4a45" },
  { key: "salvia", label: "Sálvia", base: "#3f6f4f", strong: "#325a3f" },
  { key: "rose", label: "Rosé", base: "#a2425f", strong: "#85344d" },
  { key: "ameixa", label: "Ameixa", base: "#6a4678", strong: "#553860" },
  { key: "azul", label: "Azul", base: "#2c5a7a", strong: "#224762" },
  { key: "bronze", label: "Bronze", base: "#80612f", strong: "#664d25" },
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
