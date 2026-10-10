// Modelo e regras de estado da conexão oficial do WhatsApp Business Platform
// (Meta) por organização.
//
// MÓDULO PURO: não acessa banco, rede nem segredos. Recebe uma linha (já lida da
// tabela `whatsapp_integrations`) e devolve um objeto pronto para a interface,
// SEMPRE sem o token. Assim a regra de "estado honesto" é verificável sem banco
// e nenhum segredo sai da camada de persistência.
//
// Honestidade: quando a estrutura do banco ainda não existe, o estado devolvido
// marca `ready = false` (a interface mostra "estrutura pendente") em vez de
// fingir que está conectado.

export const WHATSAPP_INTEGRATION_PROVIDER = "whatsapp_cloud_api";

// Estados do ciclo de vida admitidos pela migration 037 (superconjunto dos da
// migration 035). Não inventamos estados: a lista reflete exatamente o CHECK.
export type WhatsAppIntegrationLifecycleStatus =
  | "not_configured"
  | "pending"
  | "connected"
  | "error"
  | "incomplete"
  | "disconnected"
  | "revoked";

const LIFECYCLE_STATUSES: readonly WhatsAppIntegrationLifecycleStatus[] = [
  "not_configured",
  "pending",
  "connected",
  "error",
  "incomplete",
  "disconnected",
  "revoked",
];

export const WHATSAPP_LIFECYCLE_LABELS: Record<
  WhatsAppIntegrationLifecycleStatus,
  string
> = {
  not_configured: "Não configurado",
  pending: "Conexão pendente",
  connected: "Conectado",
  error: "Com erro",
  incomplete: "Dados incompletos",
  disconnected: "Desconectado",
  revoked: "Autorização revogada",
};

export function isWhatsAppLifecycleStatus(
  value: unknown
): value is WhatsAppIntegrationLifecycleStatus {
  return (
    typeof value === "string" &&
    (LIFECYCLE_STATUSES as readonly string[]).includes(value)
  );
}

// Linha da tabela `whatsapp_integrations` como o driver devolve. As colunas de
// data podem chegar como Date ou string dependendo do driver/versão, por isso o
// tipo admite os dois.
export type WhatsAppIntegrationRow = {
  status: string | null;
  phone_number_id: string | null;
  business_account_id: string | null;
  display_phone_number: string | null;
  verified_name: string | null;
  webhook_configured: boolean | null;
  token_expires_at: string | Date | null;
  connected_at: string | Date | null;
  disconnected_at: string | Date | null;
  last_webhook_at: string | Date | null;
  last_checked_at: string | Date | null;
  last_error: string | null;
  access_token_encrypted: string | null;
};

// Estado público da conexão da organização. NUNCA contém o token nem o segredo:
// apenas se existe um token armazenado (`hasStoredToken`).
export type OrganizationWhatsAppIntegration = {
  provider: string;
  // `true` somente quando a estrutura do banco (tabelas/colunas) existe.
  ready: boolean;
  // `true` quando há de fato como enviar: status conectado, número e token
  // armazenado, e token não expirado.
  connected: boolean;
  status: WhatsAppIntegrationLifecycleStatus | null;
  statusLabel: string;
  phoneNumberId: string | null;
  businessAccountId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  webhookConfigured: boolean;
  hasStoredToken: boolean;
  tokenExpiresAt: string | null;
  tokenExpired: boolean;
  connectedAt: string | null;
  disconnectedAt: string | null;
  lastWebhookAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
};

// Normaliza um valor de data vindo do driver para ISO-8601 ou null. Nunca lança.
export function toIsoOrNull(
  value: string | Date | null | undefined
): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function emptyState(
  ready: boolean,
  status: WhatsAppIntegrationLifecycleStatus | null,
  statusLabel: string
): OrganizationWhatsAppIntegration {
  return {
    provider: WHATSAPP_INTEGRATION_PROVIDER,
    ready,
    connected: false,
    status,
    statusLabel,
    phoneNumberId: null,
    businessAccountId: null,
    displayPhoneNumber: null,
    verifiedName: null,
    webhookConfigured: false,
    hasStoredToken: false,
    tokenExpiresAt: null,
    tokenExpired: false,
    connectedAt: null,
    disconnectedAt: null,
    lastWebhookAt: null,
    lastCheckedAt: null,
    lastError: null,
  };
}

// Monta o estado a partir de uma linha real. Não confia cegamente no status do
// banco: só considera `connected` quando há número + token armazenado e o token
// não está expirado. Um status desconhecido é tratado como "error".
export function buildOrganizationIntegrationState(input: {
  ready: boolean;
  row: WhatsAppIntegrationRow | null;
  now?: Date;
}): OrganizationWhatsAppIntegration {
  const nowMs = (input.now ?? new Date()).getTime();

  if (!input.ready) {
    return emptyState(false, null, "Estrutura pendente");
  }

  if (!input.row) {
    return emptyState(
      true,
      "not_configured",
      WHATSAPP_LIFECYCLE_LABELS.not_configured
    );
  }

  const row = input.row;
  const status: WhatsAppIntegrationLifecycleStatus = isWhatsAppLifecycleStatus(
    row.status
  )
    ? row.status
    : "error";

  const hasStoredToken = Boolean(
    row.access_token_encrypted && row.access_token_encrypted.length > 0
  );
  const tokenExpiresAt = toIsoOrNull(row.token_expires_at);
  const tokenExpired = tokenExpiresAt
    ? new Date(tokenExpiresAt).getTime() <= nowMs
    : false;
  const hasPhoneNumber = Boolean(row.phone_number_id);
  const connected =
    status === "connected" && hasStoredToken && hasPhoneNumber && !tokenExpired;

  return {
    provider: WHATSAPP_INTEGRATION_PROVIDER,
    ready: true,
    connected,
    status,
    statusLabel: WHATSAPP_LIFECYCLE_LABELS[status],
    phoneNumberId: row.phone_number_id ?? null,
    businessAccountId: row.business_account_id ?? null,
    displayPhoneNumber: row.display_phone_number ?? null,
    verifiedName: row.verified_name ?? null,
    webhookConfigured: Boolean(row.webhook_configured),
    hasStoredToken,
    tokenExpiresAt,
    tokenExpired,
    connectedAt: toIsoOrNull(row.connected_at),
    disconnectedAt: toIsoOrNull(row.disconnected_at),
    lastWebhookAt: toIsoOrNull(row.last_webhook_at),
    lastCheckedAt: toIsoOrNull(row.last_checked_at),
    lastError: row.last_error ?? null,
  };
}
