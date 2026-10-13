// Testes unitários RÁPIDOS e SEM I/O da formatação do cartão digital público.
//
// Por que importam: preço e duração aparecem na lista pública de serviços e no
// formulário de agendamento. Um valor nulo NÃO pode virar "R$ 0,00" nem uma
// duração inventada — o cartão precisa omitir a informação em vez de preencher
// com dado fictício. Este teste trava esse contrato e o formato brasileiro
// (reais com vírgula decimal e ponto de milhar), que é o que a cliente final lê.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatBrlPrice,
  formatDurationMinutes,
} from "../../src/lib/public/format.ts";

describe("formatação de preço do cartão público", () => {
  it("formata em reais no padrão brasileiro", () => {
    const value = formatBrlPrice(120.5);
    assert.ok(value);
    assert.match(value, /^R\$\s?120,50$/);
  });

  it("usa ponto como separador de milhar", () => {
    const value = formatBrlPrice(1234.56);
    assert.ok(value);
    assert.match(value, /^R\$\s?1\.234,56$/);
  });

  it("mantém o zero real como R$ 0,00 (só quando o preço é zero de verdade)", () => {
    assert.match(String(formatBrlPrice(0)), /^R\$\s?0,00$/);
  });

  it("não inventa valor quando o preço não está cadastrado", () => {
    assert.equal(formatBrlPrice(null), null);
    assert.equal(formatBrlPrice(Number.NaN), null);
  });
});

describe("formatação de duração do cartão público", () => {
  it("mostra a duração cadastrada em minutos", () => {
    assert.equal(formatDurationMinutes(45), "45 min");
  });

  it("devolve null quando a duração não está cadastrada ou é inválida", () => {
    assert.equal(formatDurationMinutes(null), null);
    assert.equal(formatDurationMinutes(0), null);
    assert.equal(formatDurationMinutes(-10), null);
    assert.equal(formatDurationMinutes(Number.NaN), null);
    assert.equal(formatDurationMinutes(Number.POSITIVE_INFINITY), null);
  });
});
