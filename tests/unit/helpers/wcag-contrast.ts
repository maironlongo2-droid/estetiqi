// Utilidades de contraste da WCAG 2.1 usadas pelos testes unitários de cor.
//
// Ficam em um só lugar porque a paleta de destaque do cartão
// (public-accent.test.ts) e os tokens visuais do cartão
// (public-card-style.test.ts) precisam MEDIR a legibilidade em vez de presumir
// que a cor escolhida é legível. A fórmula é a oficial: luminância relativa com
// correção de gama e razão (claro + 0,05) / (escuro + 0,05).

export function channelToLinear(value: number): number {
  const channel = value / 255;
  return channel <= 0.03928
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const clean = hex.replace("#", "");

  if (!/^[0-9a-f]{6}$/i.test(clean)) {
    throw new Error(`cor hexadecimal inválida: ${hex}`);
  }

  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);

  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

export function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

// Rótulo pronto para mensagem de erro: "4,82:1".
export function ratioLabel(foreground: string, background: string): string {
  return `${contrast(foreground, background).toFixed(2)}:1`;
}
