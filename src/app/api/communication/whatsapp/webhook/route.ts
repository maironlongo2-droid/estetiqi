import { readWhatsAppConfig } from "@/lib/communication/whatsapp-status";
import {
  META_SIGNATURE_HEADER,
  constantTimeEqual,
  verifyMetaSignature,
} from "@/lib/communication/whatsapp-webhook";
import { clientIpFromRequest, rateLimit } from "@/lib/security/rate-limit";

// Webhook oficial da Meta (WhatsApp Business Cloud API).
//
// Este endpoint é PÚBLICO por natureza: a Meta não envia credenciais Clerk. A
// proteção NÃO é autenticação de usuário, e sim a verificação da assinatura
// HMAC-SHA256 (`X-Hub-Signature-256`) no POST e o token de verificação no GET.
// A organização não é derivada de dados do cliente — nada por organização é
// lido aqui ainda.
//
// Nesta etapa o endpoint apenas RECEBE e VALIDA. Nenhuma resposta automática é
// enviada a clientes, nenhuma automação de agendamento é executada, o fluxo de
// autenticação/RBAC/isolamento não é tocado e nada é gravado no banco.
//
// Compatibilidade com a Vercel: runtime Node.js (necessário para `node:crypto`),
// corpo bruto lido antes de qualquer parsing e nenhuma dependência de estado em
// memória entre requisições.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
// bruto e confirmamos o recebimento. Não processamos eventos nem respondemos a
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

  // Corpo BRUTO preservado: a assinatura é calculada exatamente sobre estes
  // bytes, do mesmo modo que a Meta calculou.
  const rawBody = await request.text();
  const signature = request.headers.get(META_SIGNATURE_HEADER);

  if (!verifyMetaSignature(rawBody, signature, config.appSecret)) {
    return Response.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let payload: { object?: unknown } | null = null;
  try {
    payload = JSON.parse(rawBody) as { object?: unknown };
  } catch {
    return Response.json({ error: "Corpo inválido." }, { status: 400 });
  }

  // Log mínimo e sem dados pessoais: apenas o tipo do objeto da Meta.
  console.log(
    "[whatsapp-webhook] notificação recebida:",
    typeof payload?.object === "string" ? payload.object : "desconhecido"
  );

  // Confirmação rápida para a Meta não reenviar. Nenhuma resposta é enviada a
  // clientes nesta etapa.
  return Response.json({ received: true });
}
