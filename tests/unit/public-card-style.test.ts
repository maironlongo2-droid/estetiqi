// Testes unitários RÁPIDOS da IDENTIDADE VISUAL do cartão digital público.
//
// Por que um teste de CSS: as cores que o visitante realmente vê vivem em
// src/app/globals.css — o cartão não recebe cor do banco nem do navegador. Este
// arquivo lê o CSS de verdade e verifica três coisas que sustentam o produto:
//
// 1. a paleta é FIXA (creme no fundo, branco nas caixas de conteúdo e creme
//    suave nos controles) e não existe nenhum seletor de cor personalizável: a
//    escolha de cor foi removida do produto e não pode voltar por engano;
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

import { contrast, ratioLabel } from "./helpers/wcag-contrast.ts";

const CARD_CSS = readFileSync(
  new URL("../../src/app/globals.css", import.meta.url),
  "utf8"
);

// As TELAS do cartão. Declarar o token certo no CSS não basta: o requisito é que
// as superfícies realmente pintadas usem essa paleta (creme no fundo, branco nas
// caixas, creme suave nos controles e a identidade só na ação principal). Foi
// exatamente aqui que o cartão ficou errado antes — CSS novo, componentes com as
// cores antigas —, então o teste lê os dois arquivos de tela e confere a cor de
// cada superfície.
const CARD_PAGE = readFileSync(
  new URL("../../src/app/agendar/[slug]/page.tsx", import.meta.url),
  "utf8"
);
const CARD_FORM = readFileSync(
  new URL("../../src/app/agendar/[slug]/booking-form.tsx", import.meta.url),
  "utf8"
);

function countOf(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

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

// O cartão público NÃO tem tema escuro: ele já ficou quase preto (#171214) para
// visitantes com o sistema em modo escuro, o que quebra o requisito do produto.
// Este marcador alimenta o teste que impede a volta desse comportamento.
const DARK_MEDIA_MARKER = "prefers-color-scheme";

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

const ACCENT_SELECTOR_MARKER = "[data-accent";

describe("identidade visual do cartão público", () => {
  it("usa o creme no fundo e o branco nas caixas de conteúdo", () => {
    const light = declarationsOf(".eq-public");

    // Creme: fundo do documento.
    assert.equal(token(light, "--eq-page"), "#f6f4ef");
    // Creme suave: superfície dos controles (botões secundários, controles
    // desativados) e hover um degrau mais forte.
    assert.equal(token(light, "--eq-soft"), "#efece5");
    assert.equal(token(light, "--eq-action-hover"), "#eae6de");

    // Branco: caixas de conteúdo (cabeçalho, serviços, equipe, localização,
    // agendamento, calendário e confirmação) e a faixa de capa quando não há foto.
    assert.equal(token(light, "--eq-card"), "#ffffff");
    assert.equal(token(light, "--eq-card-border"), "#e6e2da");
    assert.equal(token(light, "--eq-border"), "#e6e2da");
    assert.equal(token(light, "--eq-cover"), "#e4eae3");

    assert.equal(token(light, "--eq-ink"), "#22312b");
    assert.equal(token(light, "--eq-muted"), "#596860");

    // A borda dos campos é a mais escura da paleta de propósito: é ela que
    // precisa alcançar 3:1 contra o branco da caixa (medido mais abaixo).
    assert.equal(token(light, "--eq-field-border"), "#7c8a83");

    // Texto sobre a ação principal é sempre branco, como a paleta assume.
    assert.equal(token(light, "--eq-accent-on"), "#ffffff");
  });

  it("dá aos controles a superfície de creme suave, nunca o preenchimento da ação principal", () => {
    const light = declarationsOf(".eq-public");
    const link = declarationsOf(".eq-contact-link");

    // WhatsApp, Instagram, telefone, e-mail e "Como chegar" compartilham o mesmo
    // desenho: creme suave, contorno de campo e hover um degrau mais forte. O
    // preenchimento da identidade fica reservado para a ação de agendamento, que
    // é o que dá hierarquia à página.
    assert.equal(token(link, "background"), "var(--eq-soft, #efece5)");
    assert.equal(
      token(link, "border"),
      "1px solid var(--eq-field-border, #7c8a83)"
    );
    assert.equal(
      token(declarationsOf(".eq-contact-link:hover"), "background"),
      "var(--eq-action-hover, #eae6de)"
    );

    // 48px é o alvo de toque confortável no celular — o mesmo da ação principal.
    assert.equal(token(link, "min-height"), "48px");

    // O rótulo do botão continua legível sobre a superfície em que ele vive.
    expectContrast(
      "--eq-ink sobre o creme suave dos controles",
      token(light, "--eq-ink"),
      token(light, "--eq-soft"),
      4.5
    );
  });

  it("não expõe nenhuma cor personalizável no CSS nem nas telas", () => {
    // A escolha de cor foi removida do produto: o cartão tem uma identidade
    // fixa. Este teste existe para que um seletor de cor reintroduzido sem
    // querer (como o antigo `.eq-public[data-accent="..."]`) não volte a tingir
    // a página pública nem por configuração antiga.
    const accentSelectors = RULES.map((rule) => rule.selector).filter((selector) =>
      splitSelectorList(selector).some((part) =>
        part.includes(ACCENT_SELECTOR_MARKER)
      )
    );
    assert.deepEqual(
      accentSelectors,
      [],
      "o CSS do cartão não pode ter seletor de cor personalizável"
    );

    for (const source of [CARD_PAGE, CARD_FORM]) {
      assert.ok(
        !source.includes(ACCENT_SELECTOR_MARKER),
        "as telas do cartão não podem aplicar cor por atributo"
      );
    }

    // A identidade do cartão continua definida em tokens fixos e válidos.
    const light = declarationsOf(".eq-public");
    for (const name of [
      "--eq-accent",
      "--eq-accent-strong",
      "--eq-accent-soft",
      "--eq-accent-text",
      "--eq-accent-on",
    ]) {
      assert.match(
        token(light, name),
        /^#[0-9a-f]{6}$/i,
        `${name} precisa ser uma cor hexadecimal fixa`
      );
    }
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

    // Texto branco sobre a identidade do cartão (ação principal preenchida e dia
    // selecionado), a identidade como texto sobre as caixas brancas e o texto do
    // avatar sobre a tinta suave. A identidade é fixa, então basta medir uma vez.
    expectContrast(
      "--eq-accent-on sobre --eq-accent",
      token(light, "--eq-accent-on"),
      token(light, "--eq-accent"),
      4.5
    );
    expectContrast(
      "--eq-accent-on sobre --eq-accent-strong (interação)",
      token(light, "--eq-accent-on"),
      token(light, "--eq-accent-strong"),
      4.5
    );
    expectContrast(
      "--eq-accent-text sobre --eq-card (branco da caixa)",
      token(light, "--eq-accent-text"),
      token(light, "--eq-card"),
      4.5
    );
    // A tinta suave carrega texto GRANDE (iniciais do avatar em negrito com pelo
    // menos 24px), portanto 3:1 já atende à WCAG.
    expectContrast(
      "--eq-accent-text sobre --eq-accent-soft",
      token(light, "--eq-accent-text"),
      token(light, "--eq-accent-soft"),
      3
    );
  });

  it("mantém o cartão claro mesmo com o sistema em modo escuro", () => {
    // Regressão real: com o sistema em modo escuro o cartão público ficava quase
    // preto (--eq-page #171214), contrariando o requisito de fundo gelo claro em
    // qualquer aparelho. Logo, nenhuma regra do cartão pode depender do tema.
    const darkRules = RULES.filter(
      (rule) =>
        rule.context.some((entry) => entry.includes(DARK_MEDIA_MARKER)) &&
        splitSelectorList(rule.selector).some((selector) =>
          selector.includes(".eq-public")
        )
    );

    assert.deepEqual(
      darkRules.map((rule) => rule.selector),
      [],
      "o cartão público não pode ter regras condicionadas ao modo escuro"
    );

    // `color-scheme: light` mantém campos, seletores e barras de rolagem claros
    // mesmo com o sistema operacional em modo escuro.
    assert.equal(
      token(declarationsOf(".eq-public"), "color-scheme"),
      "light",
      "o cartão público precisa declarar color-scheme: light"
    );

    // O fundo externo (html/body) é o canvas que aparece na rolagem elástica do
    // celular: precisa ser o creme do cartão em qualquer tema, sem alternância.
    // Ele é escrito em hexadecimal porque os tokens vivem em `.eq-public` — um
    // descendente — e não chegam ao <html>; comparar com `--eq-page` impede que
    // os dois divirjam e o canvas volte ao creme do resto do app.
    const outerPage = token(declarationsOf(".eq-public"), "--eq-page");
    for (const outer of ["html:has(main.eq-public)", "body:has(main.eq-public)"]) {
      const background = declarationsOf(outer).background;
      assert.equal(
        background,
        "#f6f4ef",
        `${outer} precisa manter o creme do cartão em qualquer tema`
      );
      assert.equal(
        background,
        outerPage,
        `${outer} não pode divergir de --eq-page`
      );
    }
  });
});

describe("controles e foco do cartão público", () => {
  it("dá contraste de controle (>= 3:1) à borda dos campos", () => {
    const light = declarationsOf(".eq-public");

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
  });

  it("mantém o foco de teclado visível dentro do cartão", () => {
    const focusRule = declarationsOf(
      ".eq-public :where(a, button, input, select, textarea):focus-visible"
    );

    assert.equal(
      token(focusRule, "outline-color"),
      "var(--eq-accent)",
      "o anel de foco do cartão precisa usar a identidade fixa do cartão"
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
    assert.equal(token(image, "object-position"), "center");
  });

  it("dá à foto da profissional uma superfície sólida própria, igual à caixa", () => {
    // Nenhum tom de fora da caixa pode aparecer através do círculo da foto: a
    // área tem fundo sólido próprio (o branco da caixa) e nada deixa a imagem
    // translúcida.
    assert.equal(
      token(declarationsOf(".eq-avatar--photo"), "background"),
      "var(--eq-card, #ffffff)"
    );

    for (const selector of [".eq-avatar", ".eq-avatar > img"]) {
      const declarations = declarationsOf(selector);

      for (const forbidden of ["opacity", "mix-blend-mode", "filter"]) {
        assert.equal(
          declarations[forbidden],
          undefined,
          `${selector} não pode declarar ${forbidden} (deixaria o verde da caixa aparecer na foto)`
        );
      }
    }
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

describe("paleta aplicada nas telas do cartão público", () => {
  it("usa o creme no fundo e o verde da capa sem foto", () => {
    // Fundo geral em creme; a superfície branca do cartão vem SEMPRE do token,
    // nunca de uma classe de branco solta na tela (que escaparia da paleta).
    assert.match(CARD_PAGE, /<main[^>]*bg-\[var\(--eq-page\)\]/);
    assert.equal(countOf(CARD_PAGE, "bg-white"), 0);
    assert.equal(countOf(CARD_FORM, "bg-white"), 0);

    // Capa: com foto continua sendo a imagem cadastrada; sem foto, a faixa é o
    // verde do cartão — nunca transparente, branca ou fora da paleta.
    assert.ok(
      CARD_PAGE.includes("organization.hasCover ?"),
      "a capa com foto precisa continuar sendo exibida"
    );
    assert.match(CARD_PAGE, /className="h-32 w-full bg-\[var\(--eq-cover\)\]/);
    assert.equal(
      countOf(CARD_PAGE, "linear-gradient"),
      0,
      "a capa sem foto não pode voltar a usar gradiente"
    );
  });

  it("pinta com o branco da caixa todas as superfícies de conteúdo", () => {
    // Cabeçalho (perfil), procedimentos, equipe, localização e estado vazio na
    // página; confirmação, área fechada e formulário no formulário de agendamento.
    assert.ok(countOf(CARD_PAGE, "bg-[var(--eq-card)]") >= 5);
    assert.ok(countOf(CARD_FORM, "bg-[var(--eq-card)]") >= 3);

    // Nenhum botão (pill arredondado) pode herdar o branco da caixa.
    for (const source of [CARD_PAGE, CARD_FORM]) {
      for (const line of source.split("\n")) {
        if (!line.includes("bg-[var(--eq-card)]")) continue;
        assert.ok(
          !line.includes("rounded-full"),
          `botão pintado com a cor das caixas: ${line.trim()}`
        );
      }
    }
  });

  it("reserva o preenchimento da identidade para a ação de agendamento", () => {
    // Ação principal do cartão (agendar): preenchida com a identidade e com o
    // texto branco cujo contraste é medido no bloco de contraste.
    assert.match(
      CARD_PAGE,
      /eq-elevation-action[^>]*bg-\[var\(--eq-accent\)\][^>]*text-\[var\(--eq-accent-on\)\]/
    );

    // É a ÚNICA superfície preenchida com a identidade na página: os demais
    // botões são controles de creme suave e não competem com o agendamento.
    assert.equal(
      countOf(CARD_PAGE, "bg-[var(--eq-accent)]"),
      1,
      "somente a ação de agendamento pode ser preenchida com a identidade"
    );

    // Contatos (WhatsApp, Instagram, "Como chegar") usam a classe do CSS, que
    // também tem a superfície de creme suave.
    assert.ok(
      countOf(CARD_PAGE, "eq-contact-link") >= 3,
      "os botões de contato do cartão precisam continuar existindo"
    );

    // Ações do formulário: agendar/confirmar, falar no WhatsApp, fechar e voltar.
    for (const action of [
      "border-2 border-[var(--eq-accent)] bg-[var(--eq-page)]",
      "border-[var(--eq-field-border)] bg-[var(--eq-page)]",
    ]) {
      assert.ok(
        CARD_FORM.includes(action),
        `botão de ação sem a superfície clara: ${action}`
      );
    }
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




