// Testes unitários RÁPIDOS e SEM I/O da proteção das credenciais do WhatsApp
// Business em repouso (AES-256-GCM).
//
// Rodam com o test runner nativo do Node (`npm run test:unit`). Usam chaves
// efêmeras geradas no teste: nenhum segredo real e nenhum banco.
//
// Por que estes casos importam: o token de acesso da Meta dá controle total do
// número da profissional. Ele NUNCA pode ser gravado em texto puro nem pode ser
// "consertado" quando inválido; falhas de autenticação precisam ser recusadas.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CREDENTIALS_KEY_ENV,
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  parseCredentialsKey,
  readCredentialsKey,
} from "../../src/lib/communication/whatsapp-credentials.ts";

const KEY = parseCredentialsKey("a".repeat(64));
assert.ok(KEY, "a chave de teste deveria ser válida");

const OTHER_KEY = parseCredentialsKey("b".repeat(64));
assert.ok(OTHER_KEY, "a segunda chave de teste deveria ser válida");

describe("parseCredentialsKey", () => {
  it("aceita hexadecimal de 64 caracteres (32 bytes)", () => {
    const key = parseCredentialsKey("0123456789abcdef".repeat(4));
    assert.ok(key);
    assert.equal(key.length, 32);
  });

  it("aceita base64 que resulta em exatamente 32 bytes", () => {
    const base64 = Buffer.alloc(32, 7).toString("base64");
    const key = parseCredentialsKey(base64);
    assert.ok(key);
    assert.equal(key.length, 32);
  });

  it("ignora espaços em volta do valor", () => {
    assert.ok(parseCredentialsKey(`  ${"c".repeat(64)}  `));
  });

  it("rejeita valores ausentes ou vazios", () => {
    assert.equal(parseCredentialsKey(null), null);
    assert.equal(parseCredentialsKey(undefined), null);
    assert.equal(parseCredentialsKey(""), null);
    assert.equal(parseCredentialsKey("   "), null);
  });

  it("rejeita chave com tamanho diferente de 32 bytes", () => {
    assert.equal(parseCredentialsKey("a".repeat(63)), null);
    assert.equal(parseCredentialsKey("a".repeat(66)), null);
    assert.equal(parseCredentialsKey(Buffer.alloc(16, 1).toString("base64")), null);
  });

  it("rejeita valores que não são hexadecimal nem base64", () => {
    assert.equal(parseCredentialsKey("não-é-uma-chave!"), null);
  });
});

describe("readCredentialsKey", () => {
  it("lê a chave da variável de ambiente dedicada", () => {
    const env = {
      [CREDENTIALS_KEY_ENV]: "d".repeat(64),
    } as unknown as NodeJS.ProcessEnv;
    const key = readCredentialsKey(env);
    assert.ok(key);
    assert.equal(key.length, 32);
  });

  it("devolve null quando a variável não está configurada", () => {
    assert.equal(readCredentialsKey({} as unknown as NodeJS.ProcessEnv), null);
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("faz o caminho de ida e volta do segredo", () => {
    const token = "EAAG-exemplo-de-token-da-meta";
    const ciphertext = encryptSecret(token, KEY);
    assert.notEqual(ciphertext, token);
    assert.equal(decryptSecret(ciphertext, KEY), token);
  });

  it("preserva acentos e emoji", () => {
    const token = "token com ção 💅 🚀";
    assert.equal(decryptSecret(encryptSecret(token, KEY), KEY), token);
  });

  it("gera texto cifrado diferente a cada chamada (IV aleatório)", () => {
    const token = "mesmo-token";
    assert.notEqual(encryptSecret(token, KEY), encryptSecret(token, KEY));
  });

  it("nunca devolve o texto puro no conteúdo cifrado", () => {
    const token = "segredo-visivel";
    assert.equal(encryptSecret(token, KEY).includes(token), false);
  });

  it("devolve null ao decifrar com a chave errada", () => {
    const ciphertext = encryptSecret("token", KEY);
    assert.equal(decryptSecret(ciphertext, OTHER_KEY), null);
  });

  it("devolve null quando o dado cifrado foi adulterado", () => {
    const ciphertext = encryptSecret("token", KEY);
    const parts = ciphertext.split(":");
    const tampered = [parts[0], parts[1], parts[2], "AAAA"].join(":");
    assert.equal(decryptSecret(tampered, KEY), null);
  });

  it("devolve null para entrada ausente ou malformada", () => {
    assert.equal(decryptSecret(null, KEY), null);
    assert.equal(decryptSecret(undefined, KEY), null);
    assert.equal(decryptSecret("", KEY), null);
    assert.equal(decryptSecret("texto-puro", KEY), null);
    assert.equal(decryptSecret("v2:a:b:c", KEY), null);
    assert.equal(decryptSecret("v1:a:b", KEY), null);
  });
});

describe("isEncryptedSecret", () => {
  it("reconhece o formato cifrado deste módulo", () => {
    assert.equal(isEncryptedSecret(encryptSecret("token", KEY)), true);
  });

  it("não confunde texto puro com texto cifrado", () => {
    assert.equal(isEncryptedSecret("EAAG-token-em-texto-puro"), false);
    assert.equal(isEncryptedSecret(null), false);
    assert.equal(isEncryptedSecret(123), false);
  });
});
