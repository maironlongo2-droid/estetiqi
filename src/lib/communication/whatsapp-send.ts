// Camada de serviço para ENVIO pela WhatsApp Business Cloud API (Meta).
//
// MÓDULO EXCLUSIVO DO SERVIDOR. Acionado apenas por POST
// /api/communication/whatsapp/send, que usa as credenciais da PRÓPRIA organização
// (lidas e decifradas no servidor). Sem número conectado a rota responde 409 e a
// interface explica o motivo; o wa.me continua como caminho manual, que nunca é
// registrado como enviado.
//
// A função é defensiva e NUNCA lança: devolve um resultado explícito para que o
// chamador só afirme sucesso quando houver a confirmação real do provedor (o
// identificador retornado pela Meta).
//
// Requisitos da Meta respeitados:
// - Mensagens iniciadas pela empresa, fora da janela de atendimento de 24h,
//   exigem um TEMPLATE aprovado. Texto livre só é permitido dentro da janela de
//   conversa. Por isso o tipo distingue texto de template.
// - O número destinatário é validado antes do envio.

import { normalizeWhatsapp } from "@/lib/public/contact-links";
import { readWhatsAppConfig } from "@/lib/communication/whatsapp-status";

const GRAPH_API_VERSION = "v21.0";
const SEND_TIMEOUT_MS = 10000;

export type WhatsAppSendResult =
  | { ok: true; providerMessageId: string }
  | {
      ok: false;
      code: "NOT_CONFIGURED" | "INVALID_PHONE" | "REQUEST_FAILED";
      message: string;
    };

export type WhatsAppTextMessage = { kind: "text"; body: string };

export type WhatsAppTemplateMessage = {
  kind: "template";
  name: string;
  languageCode: string;
  bodyParameters?: string[];
};

// Credenciais por organização. Quando informadas (integração conectada), têm
// prioridade sobre a configuração global por variáveis de ambiente. São sempre
// passadas já decifradas por quem chama (o armazenamento da integração); este
// módulo NUNCA lê o banco nem guarda segredos.
export type WhatsAppSendCredentials = {
  accessToken: string | null;
  phoneNumberId: string | null;
};

export async function sendWhatsAppMessage(
  input: {
    to: string | null | undefined;
    message: WhatsAppTextMessage | WhatsAppTemplateMessage;
    credentials?: WhatsAppSendCredentials | null;
  },
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<WhatsAppSendResult> {
  const config = readWhatsAppConfig(env);
  const accessToken =
    input.credentials?.accessToken?.trim() || config.accessToken;
  const phoneNumberId =
    input.credentials?.phoneNumberId?.trim() || config.phoneNumberId;

  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message:
        "A integração com a WhatsApp Business Cloud API não está configurada.",
    };
  }

  const to = normalizeWhatsapp(input.to);
  if (!to) {
    return {
      ok: false,
      code: "INVALID_PHONE",
      message: "O número da cliente é inválido para o WhatsApp.",
    };
  }

  const payload =
    input.message.kind === "text"
      ? {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: input.message.body },
        }
      : {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: input.message.name,
            language: { code: input.message.languageCode },
            ...(input.message.bodyParameters?.length
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: input.message.bodyParameters.map((text) => ({
                        type: "text",
                        text,
                      })),
                    },
                  ],
                }
              : {}),
          },
        };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const response = await fetchImpl(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(
        phoneNumberId
      )}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      }
    );

    const data = (await response.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string } }
      | null;

    if (!response.ok) {
      return {
        ok: false,
        code: "REQUEST_FAILED",
        message:
          data?.error?.message ?? `A Meta recusou o envio (HTTP ${response.status}).`,
      };
    }

    const providerMessageId = data?.messages?.[0]?.id;
    if (!providerMessageId) {
      return {
        ok: false,
        code: "REQUEST_FAILED",
        message: "A Meta não retornou o identificador da mensagem.",
      };
    }

    return { ok: true, providerMessageId };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "O envio demorou demais e foi cancelado."
        : "Não foi possível contatar a API da Meta.";
    return { ok: false, code: "REQUEST_FAILED", message };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Documento (PDF) pela MESMA integração oficial.
//
// Enviar um arquivo exige DOIS passos na Cloud API: (1) subir a mídia em
// POST /{phone_number_id}/media, que devolve um identificador, e (2) enviar uma
// mensagem do tipo `document` referenciando esse identificador. Só devolvemos
// sucesso quando a Meta confirma o envio (identificador da mensagem). A função
// NUNCA lança.
//
// Observação honesta (limite real da Meta): mensagem iniciada pela empresa fora
// da janela de atendimento de 24h exige um TEMPLATE aprovado. Quando a clínica
// inicia a conversa, a Meta pode recusar o documento; nesse caso devolvemos o
// motivo informado por ela, e o estado registrado mostra exatamente isso.

export type WhatsAppDocumentInput = {
  to: string | null | undefined;
  filename: string;
  bytes: Uint8Array;
  mimeType?: string;
  caption?: string;
  credentials?: WhatsAppSendCredentials | null;
};

// Upload de arquivo pode demorar mais que o envio de texto.
const MEDIA_TIMEOUT_MS = 30000;

export async function sendWhatsAppDocument(
  input: WhatsAppDocumentInput,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch
): Promise<WhatsAppSendResult> {
  const config = readWhatsAppConfig(env);
  const accessToken =
    input.credentials?.accessToken?.trim() || config.accessToken;
  const phoneNumberId =
    input.credentials?.phoneNumberId?.trim() || config.phoneNumberId;

  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      code: "NOT_CONFIGURED",
      message:
        "A integração com a WhatsApp Business Cloud API não está configurada.",
    };
  }

  const to = normalizeWhatsapp(input.to);
  if (!to) {
    return {
      ok: false,
      code: "INVALID_PHONE",
      message: "O número da cliente é inválido para o WhatsApp.",
    };
  }

  const mimeType = input.mimeType?.trim() || "application/pdf";
  const filename = input.filename.trim() || "protocolo.pdf";

  if (input.bytes.byteLength === 0) {
    return {
      ok: false,
      code: "REQUEST_FAILED",
      message: "O documento do protocolo está vazio.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MEDIA_TIMEOUT_MS);

  try {
    // 1) Upload da mídia (cópia em buffer próprio para o Blob).
    const copy = new Uint8Array(input.bytes.byteLength);
    copy.set(input.bytes);

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", new Blob([copy], { type: mimeType }), filename);

    const upload = await fetchImpl(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(
        phoneNumberId
      )}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
        signal: controller.signal,
        cache: "no-store",
      }
    );

    const uploadData = (await upload.json().catch(() => null)) as
      | { id?: string; error?: { message?: string } }
      | null;

    if (!upload.ok || !uploadData?.id) {
      return {
        ok: false,
        code: "REQUEST_FAILED",
        message:
          uploadData?.error?.message ??
          `A Meta recusou o arquivo (HTTP ${upload.status}).`,
      };
    }

    // 2) Envio da mensagem do tipo documento, referenciando a mídia enviada.
    const caption = input.caption?.trim();
    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "document",
      document: {
        id: uploadData.id,
        filename,
        ...(caption ? { caption: caption.slice(0, 1000) } : {}),
      },
    };

    const response = await fetchImpl(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(
        phoneNumberId
      )}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
        cache: "no-store",
      }
    );

    const data = (await response.json().catch(() => null)) as
      | { messages?: { id?: string }[]; error?: { message?: string } }
      | null;

    if (!response.ok) {
      return {
        ok: false,
        code: "REQUEST_FAILED",
        message:
          data?.error?.message ??
          `A Meta recusou o envio (HTTP ${response.status}).`,
      };
    }

    const providerMessageId = data?.messages?.[0]?.id;
    if (!providerMessageId) {
      return {
        ok: false,
        code: "REQUEST_FAILED",
        message: "A Meta não retornou o identificador da mensagem.",
      };
    }

    return { ok: true, providerMessageId };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "O envio demorou demais e foi cancelado."
        : "Não foi possível contatar a API da Meta.";
    return { ok: false, code: "REQUEST_FAILED", message };
  } finally {
    clearTimeout(timeout);
  }
}
