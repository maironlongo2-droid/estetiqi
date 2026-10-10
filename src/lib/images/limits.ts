// Limites e tipos aceitos para as imagens do cartão digital (logo do negócio e
// foto das profissionais). Centralizado para que o cliente (antes do envio) e o
// servidor (na gravação) usem exatamente as mesmas regras.

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

// Tamanho máximo do arquivo original escolhido no navegador.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

// Tamanho máximo aceito pelo servidor depois do redimensionamento no navegador.
export const MAX_STORED_BYTES = 2 * 1024 * 1024; // 2 MB

// Maior lado (largura ou altura) da imagem guardada. Mantém as fotos leves.
export const IMAGE_MAX_DIMENSION = 1024;

// Largura máxima guardada da capa do cartão digital (recortada em 16:9 no
// navegador antes do envio). Mantém a capa leve e nítida em telas de celular e
// desktop.
export const COVER_MAX_WIDTH = 1280;

export function isAllowedImageType(value: string): value is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value);
}

// Valida tipo e tamanho no servidor. Retorna a mensagem de erro ou null se ok.
export function imageValidationError(
  mimeType: string,
  byteLength: number
): string | null {
  if (!isAllowedImageType(mimeType)) {
    return "Formato não suportado. Envie uma imagem JPG, PNG ou WebP.";
  }
  if (byteLength > MAX_STORED_BYTES) {
    return "Imagem muito grande. Envie um arquivo de até 2 MB.";
  }
  return null;
}
