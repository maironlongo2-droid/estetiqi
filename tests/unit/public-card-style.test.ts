// Testes unitários RÁPIDOS da IDENTIDADE VISUAL do cartão digital público.
//
// Por que um teste de CSS: a cor que a profissional escolhe viaja pelo banco
// apenas como uma CHAVE (`data-accent`), mas as cores que o visitante realmente
// vê vivem em src/app/globals.css. Se alguém ajustar a paleta em
// src/lib/public/accent.ts e esquecer o CSS (ou o contrário), o cartão passa a
// divergir do que a interface administrativa mostra. Este arquivo lê o CSS de
// verdade e verifica três coisas que sustentam o produto:
//
// 1. as seis cores do CSS são exatamente as seis do TypeScript;
// 2. o contraste de cada texto do cartão é MEDIDO com a fórmula da WCAG 2.1
//    (>= 4,5:1 para texto e >= 3:1 para borda de campo / indicador de foco);
// 3. o avatar é um círculo por construção (aspect-ratio + overflow + raio), com a
//    imagem cobrindo o círculo e sem borda, sombra ou anel próprios.
//
// A leitura do arquivo é a única I/O: local, determinística e de poucos KB — e é
// o único jeito de verificar o que o navegador aplica de fato.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_PUBLIC_ACCENT,
  PUBLIC_ACCENT_KEYS,
  PUBLIC_ACCENT_SWATCHES,
} from "../../src/lib/public/accent.ts";
import { contrast, ratioLabel } from "./helpers/wcag-contrast.ts";

const CARD_CSS = readFileSync(
  new URL("../../src/app/globals.css", import.meta.url),
  "utf8"
);

type Rule = {
  context: string[];
  selector: string;
  declarations: Record<string, string>;
};

type Frame =
  | { kind: "at-rule"; prelude: string }
  | { kind: "rule"; rule: Rule };

// Parser mínimo de CSS: devolve cada seletor com suas declarações e o contexto de
// at-rules em que ele vive (`@media`, `@supports`). Suficiente para o que este
// teste precisa medir e sem dependência nova.
function parseCss(source: string): Rule[] {
  const rules: Rule[] = [];
  const frames: Frame[] = [];
  let buffer = "";
  let index = 0;

  const contextOf = (): string[] =>
    frames
      .filter(
        (frame): frame is Extract<Frame, { kind: "at-rule" }> =>
          frame.kind === "at-rule"
      )
      .map((frame) => frame.prelude);

  const flushDeclaration = (): void => {
    const top = frames[frames.length - 1];
    const text = buffer.trim();
    buffer = "";

    if (!top || top.kind !== "rule" || text.length === 0) return;

    const separator = text.indexOf(":");
    if (separator === -1) return;

    const name = text.slice(0, separator).trim().toLowerCase();
    const value = text.slice(separator + 1).trim().replace(/\s+/g, " ");
    top.rule.declarations[name] = value;
  };

  while (index < source.length) {
    const char = source[index];

    if (char === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      index = end === -1 ? source.length : end + 2;
      continue;
    }

    if (char === "{") {
      const prelude = buffer.trim().replace(/\s+/g, " ");
      buffer = "";

      if (prelude.startsWith("@")) {
        frames.push({ kind: "at-rule", prelude });
      } else {
        const rule: Rule = {
          context: contextOf(),
          selector: prelude,
          declarations: {},
        };
        rules.push(rule);
        frames.push({ kind: "rule", rule });
      }

      index += 1;
      continue;
    }

    if (char === "}") {
      flushDeclaration();
      buffer = "";
      frames.pop();
      index += 1;
      continue;
    }

    if (char === ";") {
      flushDeclaration();
      buffer = "";
      index += 1;
      continue;
    }

    buffer += char;
    index += 1;
  }

  return rules;
}

const RULES = parseCss(CARD_CSS);

const isLightContext = (context: string[]): boolean => context.length === 0;
const isDarkContext = (context: string[]): boolean =>
  context.some((entry) => entry.includes("prefers-color-scheme: dark"));

// Divide a lista de seletores de uma regra respeitando parênteses: em
// `:where(a, button)` a vírgula faz parte do seletor, não separa regras.
function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const char of selector) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);

    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
}

// Junta as declarações de todas as ocorrências de um seletor, para que dividir um
// bloco em dois (como `.eq-public`, tokens + fundo) não quebre o teste. Aceita
// seletor agrupado (`.a, .b { ... }`), que é como o CSS agrupa os pseudo-elementos
// do avatar.
function declarationsOf(
  selector: string,
  matchesContext: (context: string[]) => boolean = isLightContext
): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const rule of RULES) {
    if (!splitSelectorList(rule.selector).includes(selector)) continue;
    if (!matchesContext(rule.context)) continue;
    Object.assign(merged, rule.declarations);
  }

  return merged;
}

function token(declarations: Record<string, string>, name: string): string {
  const value = declarations[name];
  assert.ok(value, `token ${name} ausente no CSS do cartão`);
  return value;
}

function expectContrast(
  label: string,
  foreground: string,
  background: string,
  minimum: number
): void {
  const value = contrast(foreground, background);
  assert.ok(
    value >= minimum,
    `${label} = ${ratioLabel(foreground, background)} (mínimo ${minimum}:1)`
  );
}

const ACCENT_BLOCK = /^\.eq-public\[data-accent="([a-z]+)"\]$/;

describe("identidade visual do cartão público", () => {
  it("usa o fundo claro documentado (rosa suave) com cartões brancos", () => {
    const light = declarationsOf(".eq-public");

    assert.equal(token(light, "--eq-page"), "#fff5f8");
    assert.equal(token(light, "--eq-soft"), "#fceef1");
    assert.equal(token(light, "--eq-card"), "#ffffff");
    assert.equal(token(light, "--eq-card-border"), "#f0dde2");
    assert.equal(token(light, "--eq-border"), "#f0dde2");
    assert.equal(token(light, "--eq-ink"), "#3f3439");
    assert.equal(token(light, "--eq-muted"), "#77676e");

    // Texto sobre a cor de destaque é sempre branco, como a paleta assume.
    assert.equal(token(light, "--eq-accent-on"), "#ffffff");
  });

  it("mantém o CSS com exatamente as seis cores da paleta do TypeScript", () => {
    const cssKeys = RULES.map((rule) => ACCENT_BLOCK.exec(rule.selector)?.[1])
      .filter((key): key is string => typeof key === "string")
      .sort();

    assert.deepEqual(cssKeys, [...PUBLIC_ACCENT_KEYS].sort());

    for (const swatch of PUBLIC_ACCENT_SWATCHES) {
      const block = declarationsOf(`.eq-public[data-accent="${swatch.key}"]`);
      assert.ok(
        Object.keys(block).length > 0,
        `bloco de cor ausente no CSS para ${swatch.key}`
      );

      assert.equal(
        token(block, "--eq-accent"),
        swatch.base,
        `--eq-accent de ${swatch.key}`
      );
      assert.equal(
        token(block, "--eq-accent-strong"),
        swatch.strong,
        `--eq-accent-strong de ${swatch.key}`
      );
      assert.equal(
        token(block, "--eq-accent-text"),
        swatch.base,
        `--eq-accent-text de ${swatch.key}`
      );
      assert.match(
        token(block, "--eq-accent-soft"),
        /^#[0-9a-f]{6}$/i,
        `--eq-accent-soft de ${swatch.key} precisa ser hexadecimal`
      );
    }

    // O bloco base do CSS precisa ser o padrão do aplicativo.
    const fallback = declarationsOf(".eq-public");
    const defaultSwatch = PUBLIC_ACCENT_SWATCHES.find(
      (swatch) => swatch.key === DEFAULT_PUBLIC_ACCENT
    );
    assert.ok(defaultSwatch, "amostra padrão ausente");
    assert.equal(token(fallback, "--eq-accent"), defaultSwatch.base);
    assert.equal(token(fallback, "--eq-accent-strong"), defaultSwatch.strong);
  });
});

describe("contraste do cartão público (WCAG 2.1)", () => {
  it("garante AA em todos os textos do modo claro", () => {
    const light = declarationsOf(".eq-public");
    const surfaces: Array<[string, string]> = [
      ["--eq-page", token(light, "--eq-page")],
      ["--eq-card", token(light, "--eq-card")],
      ["--eq-soft", token(light, "--eq-soft")],
    ];

    for (const [surfaceName, surface] of surfaces) {
      expectContrast(
        `--eq-ink sobre ${surfaceName}`,
        token(light, "--eq-ink"),
        surface,
        4.5
      );
      expectContrast(
        `--eq-muted sobre ${surfaceName}`,
        token(light, "--eq-muted"),
        surface,
        4.5
      );
    }

    expectContrast(
      "--eq-danger-text sobre --eq-danger-bg",
      token(light, "--eq-danger-text"),
      token(light, "--eq-danger-bg"),
      4.5
    );

    // Texto branco sobre a cor de destaque (botão e dia selecionado), a cor de
    // destaque sobre branco (preços/links) e o texto do avatar sobre a tinta suave.
    for (const swatch of PUBLIC_ACCENT_SWATCHES) {
      const block = declarationsOf(`.eq-public[data-accent="${swatch.key}"]`);

      expectContrast(
        `--eq-accent-on sobre ${swatch.key}`,
        token(light, "--eq-accent-on"),
        token(block, "--eq-accent"),
        4.5
      );
      expectContrast(
        `--eq-accent-on sobre ${swatch.key} (interação)`,
        token(light, "--eq-accent-on"),
        token(block, "--eq-accent-strong"),
        4.5
      );
      expectContrast(
        `--eq-accent-text de ${swatch.key} sobre o cartão`,
        token(block, "--eq-accent-text"),
        token(light, "--eq-card"),
        4.5
      );
      // A tinta suave carrega texto GRANDE (iniciais do avatar em negrito com pelo
      // menos 24px), portanto 3:1 já atende à WCAG.
      expectContrast(
        `--eq-accent-text de ${swatch.key} sobre a tinta suave`,
        token(block, "--eq-accent-text"),
        token(block, "--eq-accent-soft"),
        3
      );
    }
  });

  it("garante AA em todos os textos do modo escuro", () => {
    const dark = declarationsOf(".eq-public", isDarkContext);
    assert.ok(
      Object.keys(dark).length > 0,
      "bloco do modo escuro ausente no CSS do cartão"
    );
    assert.equal(token(dark, "color-scheme"), "dark");

    const surfaces: Array<[string, string]> = [
      ["--eq-card", token(dark, "--eq-card")],
      ["--eq-page", token(dark, "--eq-page")],
      ["--eq-soft", token(dark, "--eq-soft")],
    ];

    for (const [surfaceName, surface] of surfaces) {
      expectContrast(
        `--eq-ink sobre ${surfaceName} (escuro)`,
        token(dark, "--eq-ink"),
        surface,
        4.5
      );
      expectContrast(
        `--eq-muted sobre ${surfaceName} (escuro)`,
        token(dark, "--eq-muted"),
        surface,
        4.5
      );
    }

    expectContrast(
      "--eq-danger-text sobre --eq-danger-bg (escuro)",
      token(dark, "--eq-danger-text"),
      token(dark, "--eq-danger-bg"),
      4.5
    );
  });
});

describe("controles e foco do cartão público", () => {
  it("dá contraste de controle (>= 3:1) à borda dos campos", () => {
    const light = declarationsOf(".eq-public");
    const dark = declarationsOf(".eq-public", isDarkContext);

    expectContrast(
      "--eq-field-border sobre --eq-card",
      token(light, "--eq-field-border"),
      token(light, "--eq-card"),
      3
    );
    expectContrast(
      "--eq-field-border sobre --eq-page",
      token(light, "--eq-field-border"),
      token(light, "--eq-page"),
      3
    );
    expectContrast(
      "--eq-field-border sobre --eq-card (escuro)",
      token(dark, "--eq-field-border"),
      token(dark, "--eq-card"),
      3
    );
  });

  it("mantém o foco de teclado visível dentro do cartão", () => {
    const focusRule = declarationsOf(
      ".eq-public :where(a, button, input, select, textarea):focus-visible"
    );

    assert.equal(
      token(focusRule, "outline-color"),
      "var(--eq-accent)",
      "o anel de foco do cartão precisa usar a cor de destaque escolhida"
    );
  });
});

describe("avatar do cartão público", () => {
  it("é um círculo perfeito por construção, sem moldura quadrada", () => {
    const avatar = declarationsOf(".eq-avatar");

    assert.equal(token(avatar, "overflow"), "hidden");
    assert.match(token(avatar, "border-radius"), /^(50%|9999px)$/);
    assert.equal(token(avatar, "aspect-ratio"), "1 / 1");
    assert.equal(token(avatar, "border"), "0");
    const avatarShadow = avatar["box-shadow"];
    assert.ok(
      avatarShadow === undefined || avatarShadow === "none",
      "o avatar não pode começar com sombra (viraria moldura)"
    );

    // Nenhum pseudo-elemento pode desenhar moldura, etiqueta ou canto.
    for (const selector of [".eq-avatar::before", ".eq-avatar::after"]) {
      assert.equal(declarationsOf(selector)["content"], "none");
    }
  });

  it("faz a imagem ocupar o círculo inteiro, sem borda nem sombra próprias", () => {
    const image = declarationsOf(".eq-avatar > img");

    assert.equal(token(image, "width"), "100%");
    assert.equal(token(image, "height"), "100%");
    assert.equal(token(image, "min-width"), "100%");
    assert.equal(token(image, "min-height"), "100%");
    assert.equal(token(image, "object-fit"), "cover");
    assert.equal(token(image, "border"), "0");
    assert.equal(token(image, "border-radius"), "inherit");
    assert.equal(token(image, "box-shadow"), "none");
  });

  it("mantém o logo maior que a foto da profissional, com anel circular", () => {
    const xl = token(declarationsOf(".eq-avatar--xl"), "font-size");
    const lg = token(declarationsOf(".eq-avatar--lg"), "font-size");

    assert.match(xl, /^[\d.]+rem$/);
    assert.match(lg, /^[\d.]+rem$/);
    assert.ok(
      parseFloat(xl) > parseFloat(lg),
      `o logo (${xl}) precisa ser maior que a foto da profissional (${lg})`
    );

    // O anel é um espalhamento em volta do raio do avatar: acompanha a curva e
    // nunca desenha um quadrado ao redor da logo.
    assert.match(
      token(declarationsOf(".eq-avatar--ring"), "box-shadow"),
      /^0 0 0 [\d.]+px var\(--/
    );

    // Logo mantém a proporção dentro do círculo (nunca esticada).
    assert.equal(
      token(declarationsOf(".eq-avatar--contain > img"), "object-fit"),
      "contain"
    );
  });
});

// Guarda contra um erro que já aconteceu de verdade: um comentário fechado no
// lugar errado deixa texto solto antes do seletor, o CSS fica inválido e o
// navegador DESCARTA a regra inteira (o avatar perdia formato e recorte).
describe("integridade do CSS do cartão", () => {
  it("não deixa resto de comentário fora de comentário", () => {
    const openers = CARD_CSS.split("/*").length - 1;
    const closers = CARD_CSS.split("*/").length - 1;

    assert.equal(openers, closers, "comentários desbalanceados no CSS do cartão");

    for (const rule of RULES) {
      assert.ok(
        !rule.selector.includes("*/") && !rule.selector.includes("/*"),
        `seletor com resto de comentário: ${rule.selector.slice(0, 80)}`
      );
      assert.ok(
        Object.keys(rule.declarations).length > 0,
        `regra sem nenhuma declaração: ${rule.selector.slice(0, 80)}`
      );
    }
  });
});




