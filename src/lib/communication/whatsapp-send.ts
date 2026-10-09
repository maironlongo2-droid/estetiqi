// Camada de serviço para ENVIO pela WhatsApp Business Cloud API (Meta).
//
// MÓDULO EXCLUSIVO DO SERVIDOR. Ele NÃO é acionado pela interface nesta versão:
// sem credenciais configuradas, o envio pela API oficial permanece desabilitado e
// a profissional continua revisando e abrindo o WhatsApp (wa.me).
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

export async function sendWhatsAppMessage(
  input: {
    to: string | null | undefined;
    message: WhatsAppTextMessage | WhatsAppTemplateMessage;
  },
  env: NodeJS.ProcessEnv = process.env
): Promise<WhatsAppSendResult> {
  const config = readWhatsAppConfig(env);

  if (!config.accessToken || !config.phoneNumberId) {
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
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(
        config.phoneNumberId
      )}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
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
