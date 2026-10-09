// Estado da integração com a WhatsApp Business Cloud API (Meta).
//
// MÓDULO EXCLUSIVO DO SERVIDOR: lê segredos de `process.env` e por isso NUNCA
// deve ser importado por componentes de navegador. Ele não devolve o valor de
// nenhum segredo — apenas se cada credencial necessária está presente — para que
// a interface possa mostrar um estado honesto ("Não configurado") sem expor
// tokens.
//
// Regras de honestidade:
// - Sem credenciais: o estado é "not_configured" e nenhuma chamada externa é
//   feita.
// - Com as credenciais mínimas: faz uma verificação REAL e leve na Graph API
//   para confirmar que a conta responde. Só então o estado pode ser "ok".
// - Nunca declaramos "conectado" sem essa verificação.

// Documentação oficial da integração (para orientar a profissional).
export const WHATSAPP_CLOUD_API_DOCS =
  "https://developers.facebook.com/docs/whatsapp/cloud-api/";

// Versão da Graph API usada na verificação.
const GRAPH_API_VERSION = "v21.0";
// Tempo máximo da verificação para não pendurar a resposta da API.
const VERIFY_TIMEOUT_MS = 8000;

export type WhatsAppCredential =
  | "accessToken"
  | "phoneNumberId"
  | "businessAccountId"
  | "verifyToken"
  | "appSecret";

export type WhatsAppConfig = {
  accessToken: string | null;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  verifyToken: string | null;
  appSecret: string | null;
};

// Nomes das variáveis de ambiente que representam cada credencial. Ficam
// centralizados para que a interface possa listar exatamente o que falta sem
// repetir strings.
export const WHATSAPP_ENV_KEYS: Record<WhatsAppCredential, string> = {
  accessToken: "WHATSAPP_CLOUD_API_TOKEN",
  phoneNumberId: "WHATSAPP_PHONE_NUMBER_ID",
  businessAccountId: "WHATSAPP_BUSINESS_ACCOUNT_ID",
  verifyToken: "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  appSecret: "WHATSAPP_APP_SECRET",
};

const CREDENTIAL_LABELS: Record<WhatsAppCredential, string> = {
  accessToken: "Token de acesso",
  phoneNumberId: "Identificador do número no WhatsApp Business",
  businessAccountId: "Identificador da conta empresarial",
  verifyToken: "Token de verificação do webhook",
  appSecret: "Segredo do aplicativo (assinatura do webhook)",
};

export type WhatsAppConnectionState =
  | "not_configured"
  | "unverified"
  | "ok"
  | "error";

export type WhatsAppIntegrationStatus = {
  provider: "whatsapp_cloud_api";
  // true somente quando há o mínimo necessário para enviar/verificar.
  configured: boolean;
  // Presença de cada credencial (nunca o valor).
  credentials: Record<WhatsAppCredential, boolean>;
  // Credenciais ausentes, com rótulo legível e a variável de ambiente.
  missing: { key: WhatsAppCredential; label: string; envKey: string }[];
  // Verificação inicial do webhook pode ser tratada (verify token + app secret).
  webhookReady: boolean;
  connection: WhatsAppConnectionState;
  connectionMessage: string;
  // Número verificado devolvido pela Meta (quando a verificação teve sucesso).
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  lastCheckedAt: string;
  docsUrl: string;
};

export function readWhatsAppConfig(env: NodeJS.ProcessEnv): WhatsAppConfig {
  const read = (key: string) => {
    const value = env[key];
    return value && value.trim() ? value.trim() : null;
  };

  return {
    accessToken: read(WHATSAPP_ENV_KEYS.accessToken),
    phoneNumberId: read(WHATSAPP_ENV_KEYS.phoneNumberId),
    businessAccountId: read(WHATSAPP_ENV_KEYS.businessAccountId),
    verifyToken: read(WHATSAPP_ENV_KEYS.verifyToken),
    appSecret: read(WHATSAPP_ENV_KEYS.appSecret),
  };
}

// Verificação leve e real na Graph API. Só é chamada quando as credenciais
// mínimas existem. Nunca lança: devolve um estado de erro legível.
async function verifyConnection(
  phoneNumberId: string,
  accessToken: string
): Promise<{
  state: "ok" | "error";
  message: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

  try {
    const url =
      `https://graph.facebook.com/${GRAPH_API_VERSION}/` +
      `${encodeURIComponent(phoneNumberId)}` +
      "?fields=display_phone_number,verified_name";

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
      cache: "no-store",
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          display_phone_number?: string;
          verified_name?: string;
          error?: { message?: string };
        }
      | null;

    if (!response.ok) {
      const detail = payload?.error?.message ?? `HTTP ${response.status}`;
      return {
        state: "error",
        message: `A Meta recusou a verificação: ${detail}`,
        displayPhoneNumber: null,
        verifiedName: null,
      };
    }

    return {
      state: "ok",
      message: "Conexão verificada diretamente na API da Meta.",
      displayPhoneNumber: payload?.display_phone_number ?? null,
      verifiedName: payload?.verified_name ?? null,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "A verificação demorou demais e foi cancelada."
        : "Não foi possível contatar a API da Meta agora.";
    return {
      state: "error",
      message,
      displayPhoneNumber: null,
      verifiedName: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Monta o estado completo da integração a partir do ambiente. Nunca expõe
// segredos. Quando não há credenciais, não realiza nenhuma chamada externa.
export async function getWhatsAppIntegrationStatus(
  env: NodeJS.ProcessEnv = process.env
): Promise<WhatsAppIntegrationStatus> {
  const config = readWhatsAppConfig(env);

  const credentials: Record<WhatsAppCredential, boolean> = {
    accessToken: Boolean(config.accessToken),
    phoneNumberId: Boolean(config.phoneNumberId),
    businessAccountId: Boolean(config.businessAccountId),
    verifyToken: Boolean(config.verifyToken),
    appSecret: Boolean(config.appSecret),
  };

  const credentialKeys = Object.keys(credentials) as WhatsAppCredential[];

  const missing = credentialKeys
    .filter((key) => !credentials[key])
    .map((key) => ({
      key,
      label: CREDENTIAL_LABELS[key],
      envKey: WHATSAPP_ENV_KEYS[key],
    }));

  // Mínimo para enviar e verificar: token de acesso + número.
  const configured = Boolean(config.accessToken && config.phoneNumberId);
  // Mínimo para tratar a verificação do webhook e a assinatura das notificações.
  const webhookReady = Boolean(config.verifyToken && config.appSecret);

  const anyCredential = credentialKeys.some((key) => credentials[key]);

  let connection: WhatsAppConnectionState;
  let connectionMessage: string;
  let displayPhoneNumber: string | null = null;
  let verifiedName: string | null = null;

  if (configured) {
    const result = await verifyConnection(
      config.phoneNumberId as string,
      config.accessToken as string
    );
    connection = result.state;
    connectionMessage = result.message;
    displayPhoneNumber = result.displayPhoneNumber;
    verifiedName = result.verifiedName;
  } else if (anyCredential) {
    connection = "unverified";
    connectionMessage =
      "Há credenciais parciais, mas faltam o token de acesso e/ou o identificador do número para verificar a conexão.";
  } else {
    connection = "not_configured";
    connectionMessage =
      "Nenhuma credencial da WhatsApp Business Cloud API está configurada neste ambiente.";
  }

  return {
    provider: "whatsapp_cloud_api",
    configured,
    credentials,
    missing,
    webhookReady,
    connection,
    connectionMessage,
    displayPhoneNumber,
    verifiedName,
    lastCheckedAt: new Date().toISOString(),
    docsUrl: WHATSAPP_CLOUD_API_DOCS,
  };
}
