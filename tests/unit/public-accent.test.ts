// Testes unitários RÁPIDOS e SEM I/O da paleta do cartão digital público.
//
// Por que importam:
// 1. O banco guarda apenas a CHAVE da cor. Se um valor arbitrário (CSS, hex livre,
//    texto qualquer) conseguisse atravessar a validação, ele poderia ser usado como
//    estilo na página pública. Aqui garantimos que só as seis chaves passam.
// 2. O contraste é MEDIDO com a fórmula oficial da WCAG 2.1 (razão de contraste),
//    em vez de presumido: texto branco sobre a cor base e a cor base como texto
//    sobre fundo claro precisam atingir 4,5:1.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PUBLIC_ACCENT,
  PUBLIC_ACCENT_KEYS,
  PUBLIC_ACCENT_LABELS,
  PUBLIC_ACCENT_SWATCHES,
  isPublicAccent,
  resolvePublicAccent,
} from "../../src/lib/public/accent.ts";

const REQUIRED_KEYS = [
  "petroleo",
  "salvia",
  "rose",
  "ameixa",
  "azul",
  "bronze",
] as const;

import { contrast, ratioLabel } from "./helpers/wcag-contrast.ts";

describe("paleta de destaque do cartão", () => {
  it("expõe exatamente as seis chaves permitidas", () => {
    assert.deepEqual([...PUBLIC_ACCENT_KEYS], [...REQUIRED_KEYS]);
  });

  it("tem rótulo e amostra de cor para cada chave", () => {
    for (const key of REQUIRED_KEYS) {
      assert.ok(PUBLIC_ACCENT_LABELS[key]);
      assert.ok(
        PUBLIC_ACCENT_SWATCHES.some((swatch) => swatch.key === key),
        `amostra ausente para ${key}`
      );
    }
    assert.equal(PUBLIC_ACCENT_SWATCHES.length, 6);
  });

  it("resolve valores inválidos para o padrão do aplicativo", () => {
    assert.equal(DEFAULT_PUBLIC_ACCENT, "petroleo");

    for (const invalid of [
      null,
      undefined,
      "",
      "verde-limao",
      "#ff0000",
      "petroleo; background: url(x)",
      "PETROLEO",
      42,
      { accent: "rose" },
    ]) {
      assert.equal(
        resolvePublicAccent(invalid),
        DEFAULT_PUBLIC_ACCENT,
        `valor inválido aceito: ${JSON.stringify(invalid)}`
      );
    }

    // As chaves válidas são preservadas.
    for (const key of REQUIRED_KEYS) {
      assert.equal(resolvePublicAccent(key), key);
      assert.equal(isPublicAccent(key), true);
    }
    assert.equal(isPublicAccent("roxo-neon"), false);
  });

  it("mantém contraste WCAG AA (>= 4,5:1) nas combinações usadas pelo cartão", () => {
    for (const swatch of PUBLIC_ACCENT_SWATCHES) {
      // Texto branco sobre a cor base (botão, dia selecionado) e sobre a cor de
      // interação (hover), e a cor base como texto sobre o branco do cartão.
      const whiteOnAccent = contrast("#ffffff", swatch.base);
      const whiteOnStrong = contrast("#ffffff", swatch.strong);
      const accentOnWhite = contrast(swatch.base, "#ffffff");

      assert.ok(
        whiteOnAccent >= 4.5,
        `texto branco sobre ${swatch.key} = ${ratioLabel("#ffffff", swatch.base)}`
      );
      assert.ok(
        whiteOnStrong >= 4.5,
        `texto branco sobre ${swatch.key} (interação) = ${ratioLabel(
          "#ffffff",
          swatch.strong
        )}`
      );
      assert.ok(
        accentOnWhite >= 4.5,
        `${swatch.key} como texto sobre branco = ${ratioLabel(
          swatch.base,
          "#ffffff"
        )}`
      );
    }
  });
});
