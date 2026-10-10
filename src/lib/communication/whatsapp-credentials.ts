// Proteção das credenciais da WhatsApp Business Platform EM REPOUSO.
//
// MÓDULO EXCLUSIVO DO SERVIDOR e SEM IMPORTAÇÕES DE PROJETO: usa apenas
// `node:crypto`. Assim ele pode ser verificado isoladamente (sem banco, sem
// rede) e nunca é importado por componentes de navegador.
//
// Estratégia: AES-256-GCM (autenticado) com IV aleatório por registro. A chave
// vem EXCLUSIVAMENTE de configuração externa (`WHATSAPP_CREDENTIALS_KEY`) e
// NUNCA é inventada, gerada ou gravada pelo código. Sem a chave configurada, o
// chamador deve tratar a indisponibilidade — o sistema NÃO grava token em texto
// puro como fallback.
//
// Formato do texto cifrado (uma string, portanto cabe em uma coluna TEXT):
//   v1:<iv_base64>:<tag_base64>:<ciphertext_base64>
//
// A mesma chave (32 bytes) pode ser informada em base64 ou em hexadecimal.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Nome da variável de ambiente que guarda a chave (fora do controle de versão).
export const CREDENTIALS_KEY_ENV = "WHATSAPP_CREDENTIALS_KEY";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PAYLOAD_PREFIX = "v1";

// Converte a chave informada em um Buffer de 32 bytes. Aceita hexadecimal de 64
// caracteres ou base64 que resulte em exatamente 32 bytes. Qualquer outra coisa
// é rejeitada (retorna null) — nunca "consertamos" uma chave inválida.
export function parseCredentialsKey(
  raw: string | null | undefined
): Buffer | null {
  if (!raw) return null;

  const value = raw.trim();
  if (!value) return null;

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  const compact = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    return null;
  }

  const decoded = Buffer.from(compact, "base64");
  return decoded.length === KEY_BYTES ? decoded : null;
}

// Lê a chave do ambiente. Retorna null quando ausente/ inválida, sinalizando ao
// chamador que o armazenamento seguro de credenciais não está operacional.
export function readCredentialsKey(
  env: NodeJS.ProcessEnv = process.env
): Buffer | null {
  return parseCredentialsKey(env[CREDENTIALS_KEY_ENV]);
}

// Cifra um segredo (ex.: token de acesso). O IV é novo a cada chamada, então o
// mesmo segredo nunca produz o mesmo texto cifrado.
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    PAYLOAD_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

// Decifra um segredo. Retorna null para qualquer entrada ausente, malformada ou
// com autenticação inválida (chave errada, dado adulterado) — nunca lança.
export function decryptSecret(
  payload: string | null | undefined,
  key: Buffer
): string | null {
  if (!payload) return null;

  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PAYLOAD_PREFIX) return null;

  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ciphertext = Buffer.from(parts[3], "base64");

    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}

// Diz se um valor já está no formato cifrado deste módulo.
export function isEncryptedSecret(value: unknown): boolean {
  return (
    typeof value === "string" && value.startsWith(`${PAYLOAD_PREFIX}:`)
  );
}
