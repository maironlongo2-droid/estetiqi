import { readWhatsAppConfig } from "@/lib/communication/whatsapp-status";
import {
  META_SIGNATURE_HEADER,
  constantTimeEqual,
  verifyMetaSignature,
} from "@/lib/communication/whatsapp-webhook";
import { storeWhatsAppWebhookEvents } from "@/lib/communication/whatsapp-inbound-store";
import { clientIpFromRequest, rateLimit } from "@/lib/security/rate-limit";

// Webhook oficial da Meta (WhatsApp Business Cloud API).
//
// Este endpoint é PÚBLICO por natureza: a Meta não envia credenciais Clerk. A
// proteção NÃO é autenticação de usuário, e sim a verificação da assinatura
// HMAC-SHA256 (`X-Hub-Signature-256`) no POST e o token de verificação no GET.
// A organização não é derivada de dados enviados pelo cliente: é resolvida no
// servidor a partir do `phone_number_id` recebido (ver whatsapp-inbound-store).
//
// Nesta etapa o endpoint RECEBE, VALIDA a assinatura e GRAVA as mensagens
// recebidas de clientes (inbound) na organização dona do número que as recebeu.
// Continua sem enviar resposta automática a clientes, sem executar automação de
// agendamento e sem tocar no fluxo de autenticação/RBAC/isolamento. A empresa
// nunca é derivada do corpo da requisição: é resolvida pelo `phone_number_id`
// recebido, na camada de persistência.
//
// Compatibilidade com a Vercel: runtime Node.js (necessário para `node:crypto`),
// corpo bruto lido antes de qualquer parsing e nenhuma dependência de estado em
// memória entre requisições.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Corpo máximo aceito (proteção contra abuso trivial). Notificações reais da
// Meta são pequenas; 1 MB é folgado para o escopo atual.
const MAX_WEBHOOK_BYTES = 1_000_000;

// GET: verificação inicial exigida pela Meta ao cadastrar a Callback URL.
// A Meta envia `hub.mode`, `hub.verify_token` e `hub.challenge`; só devolvemos o
// challenge (texto puro) quando o token confere com WHATSAPP_WEBHOOK_VERIFY_TOKEN.
export async function GET(request: Request) {
  const config = readWhatsAppConfig(process.env);
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const providedToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    config.verifyToken &&
    providedToken &&
    challenge &&
    constantTimeEqual(providedToken, config.verifyToken)
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Nunca devolvemos o token esperado nem indicamos qual parâmetro falhou.
  return new Response("Forbidden", { status: 403 });
}

// POST: notificações enviadas pela Meta. Validamos a assinatura sobre o corpo
// bruto e persistimos as mensagens recebidas. Nenhuma resposta é enviada a
// clientes nesta etapa.
export async function POST(request: Request) {
  const limit = rateLimit(`whatsapp:webhook:${clientIpFromRequest(request)}`, {
    limit: 600,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return Response.json(
      { error: "Muitas requisições." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }
    );
  }

  const config = readWhatsAppConfig(process.env);

  // Sem o App Secret não há como validar a origem: recusamos sem processar.
  if (!config.appSecret) {
    return Response.json(
      { error: "Webhook não configurado." },
      { status: 503 }
    );
  }

  // Proteção contra payloads excessivos: recusamos cedo, antes de qualquer
  // parsing, quando o tamanho declarado já ultrapassa o limite.
  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return Response.json(
      { error: "Notificação muito grande." },
      { status: 413 }
    );
  }

  // Corpo BRUTO preservado: a assinatura é calculada exatamente sobre estes
  // bytes, do mesmo modo que a Meta calculou.
  const rawBody = await request.text();
  if (rawBody.length > MAX_WEBHOOK_BYTES) {
    return Response.json(
      { error: "Notificação muito grande." },
      { status: 413 }
    );
  }

  const signature = request.headers.get(META_SIGNATURE_HEADER);

  if (!verifyMetaSignature(rawBody, signature, config.appSecret)) {
    return Response.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Corpo inválido." }, { status: 400 });
  }

  try {
    // Interpreta e grava, em uma única passada, as mensagens recebidas E os
    // recibos de entrega (status) dos envios. A organização é sempre resolvida
    // pelo `phone_number_id` recebido, nunca pelo conteúdo da mensagem.
    const summary = await storeWhatsAppWebhookEvents(payload);

    // Log mínimo e sem dados pessoais: apenas contagens.
    console.log(
      "[whatsapp-webhook] notificação processada:",
      JSON.stringify(summary)
    );

    return Response.json({ received: true });
  } catch (error) {
    // Falha real de persistência: NÃO confirmamos sucesso para a Meta, para que
    // ela possa reenviar. Registramos apenas o código técnico (sem segredos,
    // sem dados pessoais e sem detalhes internos do banco).
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "unknown";
    console.error(
      "[whatsapp-webhook] falha ao persistir notificação (código:",
      code,
      ")"
    );

    return Response.json(
      { error: "Falha ao processar a notificação." },
      { status: 500 }
    );
  }
}
