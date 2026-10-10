"use client";

// Redimensiona a imagem escolhida pelo usuário no próprio navegador antes de
// enviá-la ao servidor. Assim o banco guarda apenas alguns KB por foto, sem
// precisar de biblioteca de processamento no servidor. O resultado é enviado
// como WebP (com fallback para JPEG) para preservar boa qualidade e peso baixo.

import {
  COVER_MAX_WIDTH,
  IMAGE_MAX_DIMENSION,
  MAX_UPLOAD_BYTES,
  isAllowedImageType,
} from "./limits";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    image.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

// Lê o arquivo, reduz para no máximo IMAGE_MAX_DIMENSION no maior lado e devolve
// um Blob leve pronto para envio. Lança Error com mensagem amigável quando o
// arquivo é inválido, grande demais ou não pode ser processado.
export async function prepareImage(file: File): Promise<Blob> {
  if (!isAllowedImageType(file.type)) {
    throw new Error("Formato não suportado. Envie uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Imagem muito grande. Envie um arquivo de até 4 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("Não foi possível ler a imagem.");
    }

    const scale = Math.min(
      1,
      IMAGE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight)
    );
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Não foi possível processar a imagem.");
    }
    context.drawImage(image, 0, 0, width, height);

    const webp = await canvasToBlob(canvas, "image/webp", 0.85);
    if (webp) return webp;

    const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.85);
    if (jpeg) return jpeg;

    throw new Error("Não foi possível processar a imagem.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Redimensiona e RECORTA a capa do cartão digital em 16:9, no navegador, antes do
// envio. Assim a capa nunca aparece esticada nem com proporções diferentes entre
// clínicas (o modelo do cartão é único) e o banco guarda apenas alguns KB.
export async function prepareCoverImage(file: File): Promise<Blob> {
  if (!isAllowedImageType(file.type)) {
    throw new Error("Formato não suportado. Envie uma imagem JPG, PNG ou WebP.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Imagem muito grande. Envie um arquivo de até 4 MB.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
      throw new Error("Não foi possível ler a imagem.");
    }

    // Recorte central (usa a maior área possível da imagem original).
    const targetRatio = 16 / 9;
    const sourceRatio = sourceWidth / sourceHeight;

    let cropWidth = sourceWidth;
    let cropHeight = sourceHeight;
    if (sourceRatio > targetRatio) {
      cropWidth = Math.round(sourceHeight * targetRatio);
    } else {
      cropHeight = Math.round(sourceWidth / targetRatio);
    }

    const cropX = Math.round((sourceWidth - cropWidth) / 2);
    const cropY = Math.round((sourceHeight - cropHeight) / 2);

    const width = Math.min(COVER_MAX_WIDTH, cropWidth);
    const height = Math.max(1, Math.round((width / cropWidth) * cropHeight));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Não foi possível processar a imagem.");
    }

    // Desenhar a partir do canvas gera uma imagem nova, sem metadados EXIF.
    context.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      width,
      height
    );

    const webp = await canvasToBlob(canvas, "image/webp", 0.82);
    if (webp) return webp;

    const jpeg = await canvasToBlob(canvas, "image/jpeg", 0.82);
    if (jpeg) return jpeg;

    throw new Error("Não foi possível processar a imagem.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
