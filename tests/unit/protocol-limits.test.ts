// Testes unitários RÁPIDOS e SEM I/O dos limites dos protocolos de procedimento.
//
// Por que importam: o tipo e o tamanho enviados pelo navegador NÃO são confiáveis.
// Se o servidor aceitasse qualquer arquivo "application/pdf" declarado pelo
// cliente, seria possível gravar binário arbitrário no banco. Estes casos cobrem o
// que o servidor realmente confere: MIME type, assinatura real (%PDF-), tamanho e
// o limite de 5 MB.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_PROTOCOL_BYTES,
  PROTOCOL_MIME_TYPE,
  formatProtocolSize,
  looksLikePdf,
  protocolValidationError,
} from "../../src/lib/protocols/limits.ts";

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
const NOT_PDF_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]); // ZIP

describe("constantes do protocolo", () => {
  it("usa application/pdf e limite de 5 MB", () => {
    assert.equal(PROTOCOL_MIME_TYPE, "application/pdf");
    assert.equal(MAX_PROTOCOL_BYTES, 5 * 1024 * 1024);
  });
});

describe("looksLikePdf", () => {
  it("reconhece a assinatura oficial do PDF", () => {
    assert.equal(looksLikePdf(PDF_HEAD), true);
  });

  it("recusa outro formato e conteúdo curto", () => {
    assert.equal(looksLikePdf(NOT_PDF_HEAD), false);
    assert.equal(looksLikePdf(new Uint8Array([0x25, 0x50])), false);
    assert.equal(looksLikePdf(null), false);
    assert.equal(looksLikePdf(undefined), false);
  });
});

describe("protocolValidationError", () => {
  it("aceita um PDF dentro do limite", () => {
    assert.equal(
      protocolValidationError({
        mimeType: "application/pdf",
        byteLength: 1024,
        head: PDF_HEAD,
      }),
      null
    );
  });

  it("recusa MIME type diferente de PDF", () => {
    const problem = protocolValidationError({
      mimeType: "image/png",
      byteLength: 1024,
      head: PDF_HEAD,
    });
    assert.match(String(problem), /PDF/);
  });

  it("recusa extensão disfarçada: MIME correto mas conteúdo que não é PDF", () => {
    const problem = protocolValidationError({
      mimeType: "application/pdf",
      byteLength: 2048,
      head: NOT_PDF_HEAD,
    });
    assert.match(String(problem), /PDF válido/);
  });

  it("recusa arquivo vazio e arquivo acima de 5 MB", () => {
    assert.match(
      String(
        protocolValidationError({
          mimeType: "application/pdf",
          byteLength: 0,
          head: PDF_HEAD,
        })
      ),
      /vazio/
    );

    assert.match(
      String(
        protocolValidationError({
          mimeType: "application/pdf",
          byteLength: MAX_PROTOCOL_BYTES + 1,
          head: PDF_HEAD,
        })
      ),
      /5 MB/
    );

    // Exatamente no limite continua aceito.
    assert.equal(
      protocolValidationError({
        mimeType: "application/pdf",
        byteLength: MAX_PROTOCOL_BYTES,
        head: PDF_HEAD,
      }),
      null
    );
  });
});

describe("formatProtocolSize", () => {
  it("mostra KB e MB em português", () => {
    assert.equal(formatProtocolSize(2048), "2 KB");
    assert.equal(formatProtocolSize(1024 * 1024), "1,0 MB");
    assert.equal(formatProtocolSize(0), "—");
  });
});
