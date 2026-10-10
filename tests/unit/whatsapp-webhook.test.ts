// Testes unitários RÁPIDOS e SEM I/O da verificação de webhook oficial da Meta.
//
// Rodam com o test runner nativo do Node (`npm run test:unit`), usando o suporte
// a TypeScript do Node: nenhum banco, nenhuma rede, nenhum segredo real.
//
// Por que estes casos importam: a assinatura HMAC é a ÚNICA prova de que um
// webhook realmente veio da Meta. Um falso positivo aqui permitiria injetar
// mensagens em nome de qualquer organização; um falso negativo derrubaria o
// recebimento de mensagens reais. Portanto ambos os lados são cobertos.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";

import {
  META_SIGNATURE_HEADER,
  constantTimeEqual,
  verifyMetaSignature,
} from "../../src/lib/communication/whatsapp-webhook.ts";

const APP_SECRET = "app-secret-de-teste";

// Assina um corpo como a Meta faz: HMAC-SHA256 do corpo BRUTO em hexadecimal.
function sign(body: string, secret: string = APP_SECRET): string {
  const digest = createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("hex");
  return `sha256=${digest}`;
}

describe("META_SIGNATURE_HEADER", () => {
  it("usa o cabeçalho oficial enviado pela Meta", () => {
    assert.equal(META_SIGNATURE_HEADER, "x-hub-signature-256");
  });
});

describe("constantTimeEqual", () => {
  it("considera iguais strings idênticas", () => {
    assert.equal(constantTimeEqual("segredo", "segredo"), true);
  });

  it("considera diferentes strings de mesmo tamanho", () => {
    assert.equal(constantTimeEqual("segredo", "segredx"), false);
  });

  it("considera diferentes strings de tamanhos distintos", () => {
    assert.equal(constantTimeEqual("segredo", "segredo-maior"), false);
  });

  it("aceita strings vazias", () => {
    assert.equal(constantTimeEqual("", ""), true);
  });
});

describe("verifyMetaSignature", () => {
  it("aceita uma assinatura válida do corpo bruto", () => {
    const body = JSON.stringify({ object: "whatsapp_business_account" });
    assert.equal(verifyMetaSignature(body, sign(body), APP_SECRET), true);
  });

  it("aceita o esquema em maiúsculas", () => {
    const body = "{}";
    const header = sign(body).replace("sha256=", "SHA256=");
    assert.equal(verifyMetaSignature(body, header, APP_SECRET), true);
  });

  it("ignora espaços nas bordas do cabeçalho", () => {
    const body = "{}";
    assert.equal(
      verifyMetaSignature(body, `  ${sign(body)}  `, APP_SECRET),
      true,
    );
  });

  it("confere a assinatura sobre os bytes UTF-8 (acentos e emoji)", () => {
    const body = JSON.stringify({ texto: "Olá! 💅 Agendar?" });
    assert.equal(verifyMetaSignature(body, sign(body), APP_SECRET), true);
  });

  it("rejeita a assinatura de um corpo diferente (corpo adulterado)", () => {
    const assinado = '{"a":1}';
    const adulterado = '{"a":2}';
    assert.equal(
      verifyMetaSignature(adulterado, sign(assinado), APP_SECRET),
      false,
    );
  });

  it("rejeita assinatura feita com outro App Secret", () => {
    const body = "{}";
    assert.equal(
      verifyMetaSignature(body, sign(body, "outro-segredo"), APP_SECRET),
      false,
    );
  });

  it("rejeita cabeçalho ausente ou vazio", () => {
    assert.equal(verifyMetaSignature("{}", null, APP_SECRET), false);
    assert.equal(verifyMetaSignature("{}", undefined, APP_SECRET), false);
    assert.equal(verifyMetaSignature("{}", "", APP_SECRET), false);
  });

  it("rejeita ausência de App Secret configurado", () => {
    const body = "{}";
    assert.equal(verifyMetaSignature(body, sign(body), null), false);
    assert.equal(verifyMetaSignature(body, sign(body), undefined), false);
    assert.equal(verifyMetaSignature(body, sign(body), ""), false);
  });

  it("rejeita cabeçalho sem separador '='", () => {
    assert.equal(verifyMetaSignature("{}", "sha256", APP_SECRET), false);
  });

  it("rejeita esquema diferente de sha256", () => {
    const body = "{}";
    const digest = createHmac("sha1", APP_SECRET).update(body).digest("hex");
    assert.equal(verifyMetaSignature(body, `sha1=${digest}`, APP_SECRET), false);
  });

  it("rejeita digest que não seja hexadecimal de 64 caracteres", () => {
    assert.equal(verifyMetaSignature("{}", "sha256=xyz", APP_SECRET), false);
    assert.equal(
      verifyMetaSignature("{}", `sha256=${"a".repeat(63)}`, APP_SECRET),
      false,
    );
    assert.equal(
      verifyMetaSignature("{}", `sha256=${"a".repeat(65)}`, APP_SECRET),
      false,
    );
  });

  it("nunca lança para entradas inesperadas", () => {
    assert.equal(verifyMetaSignature("", "sha256=zz", APP_SECRET), false);
    assert.equal(verifyMetaSignature("{}", "=abc", APP_SECRET), false);
    assert.equal(verifyMetaSignature("{}", "sha256=", APP_SECRET), false);
  });
});
