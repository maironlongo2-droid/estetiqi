// Verificação de webhooks oficiais da Meta (WhatsApp Cloud API).
//
// MÓDULO EXCLUSIVO DO SERVIDOR e SEM EFEITOS COLATERAIS: contém apenas funções
// puras de criptografia (`node:crypto`). Ele NUNCA registra nem devolve segredos
// — recebe o segredo como argumento, calcula o HMAC e compara em tempo constante.
//
// Como a Meta assina os webhooks:
// - Cabeçalho `X-Hub-Signature-256: sha256=<hex>`.
// - O valor é o HMAC-SHA256 do CORPO BRUTO da requisição calculado com o App
//   Secret. Por isso a rota precisa calcular sobre o texto exatamente como foi
//   recebido, sem reserializar o JSON (a reserialização mudaria os bytes).

import { createHmac, timingSafeEqual } from "node:crypto";

// Cabeçalho padrão enviado pela Meta com a assinatura.
export const META_SIGNATURE_HEADER = "x-hub-signature-256";

// Esquema de assinatura aceito (a Meta sempre usa HMAC-SHA256).
const SIGNATURE_SCHEME = "sha256";

// Comparação de strings em tempo constante. Evita revelar, pelo tempo de
// resposta, quantos caracteres de um token/segredo coincidem.
export function constantTimeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}

// Valida o cabeçalho `X-Hub-Signature-256` contra o corpo bruto e o App Secret.
// Devolve `false` para qualquer entrada ausente ou malformada — nunca lança, para
// que um valor inesperado não vire erro 500.
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string | null | undefined
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const separatorIndex = signatureHeader.indexOf("=");
  if (separatorIndex === -1) {
    return false;
  }

  const scheme = signatureHeader.slice(0, separatorIndex).trim().toLowerCase();
  const providedHex = signatureHeader.slice(separatorIndex + 1).trim();

  if (scheme !== SIGNATURE_SCHEME) {
    return false;
  }

  // A assinatura HMAC-SHA256 em hexadecimal tem exatamente 64 caracteres.
  if (!/^[0-9a-f]{64}$/i.test(providedHex)) {
    return false;
  }

  const expectedDigest = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest();
  const providedDigest = Buffer.from(providedHex, "hex");

  if (providedDigest.length !== expectedDigest.length) {
    return false;
  }

  return timingSafeEqual(providedDigest, expectedDigest);
}
