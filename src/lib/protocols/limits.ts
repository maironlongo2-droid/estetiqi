// Regras de aceitação dos protocolos de procedimento (documentos PDF da própria
// clínica). Ficam centralizadas para que o navegador (antes de enviar) e o
// servidor (antes de gravar) apliquem exatamente os mesmos limites.
//
// SEGURANÇA: o tipo informado pelo navegador (`file.type`) NÃO é confiável. O
// servidor sempre confere os primeiros bytes do arquivo (`%PDF-`) além do MIME
// type e do tamanho, para não aceitar outro formato disfarçado de PDF.
//
// ARMAZENAMENTO/LIMITE: o PDF é gravado como binário (BYTEA) no próprio
// PostgreSQL/Neon — o mesmo armazenamento persistente já usado pela logo e pelas
// fotos (migration 030) — porque o projeto não possui bucket de objetos
// configurado. O limite de 5 MB por documento mantém cada registro pequeno o
// suficiente para esse armazenamento e é validado no cliente e no servidor.

export const PROTOCOL_MIME_TYPE = "application/pdf";
export const PROTOCOL_FILE_EXTENSION = ".pdf";

// Tamanho máximo aceito de um protocolo PDF: 5 MB.
export const MAX_PROTOCOL_BYTES = 5 * 1024 * 1024;

// Assinatura de um arquivo PDF: "%PDF-" (25 50 44 46 2D).
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

export function looksLikePdf(head: Uint8Array | null | undefined): boolean {
  if (!head || head.length < PDF_MAGIC.length) return false;
  return PDF_MAGIC.every((byte, index) => head[index] === byte);
}

// Valida tipo, assinatura e tamanho no servidor. Devolve a mensagem de erro ou
// null quando o arquivo pode ser aceito.
export function protocolValidationError(input: {
  mimeType: string | null | undefined;
  byteLength: number;
  head?: Uint8Array | null;
}): string | null {
  const mimeType = (input.mimeType ?? "").trim().toLowerCase();
  if (mimeType !== PROTOCOL_MIME_TYPE) {
    return "Envie um arquivo PDF (outros formatos não são aceitos).";
  }
  if (input.byteLength <= 0) {
    return "O arquivo enviado está vazio.";
  }
  if (input.byteLength > MAX_PROTOCOL_BYTES) {
    return "Arquivo muito grande. Envie um PDF de até 5 MB.";
  }
  if (input.head && !looksLikePdf(input.head)) {
    return "O arquivo não é um PDF válido.";
  }
  return null;
}

export function formatProtocolSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
