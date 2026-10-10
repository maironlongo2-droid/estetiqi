// Persistência da conexão oficial do WhatsApp Business Platform (Meta) POR
// ORGANIZAÇÃO — o "cérebro" multitenant da Comunicação Inteligente Nível 2.
//
// MÓDULO EXCLUSIVO DO SERVIDOR. Nunca é importado por componentes de navegador.
//
// SEGURANÇA / ISOLAMENTO:
// - A organização SEMPRE vem do usuário autenticado (a rota passa o id); nunca
//   do corpo da requisição.
// - O token de acesso é gravado CIFRADO (AES-256-GCM, `whatsapp-credentials`) e
//   SÓ é decifrado aqui, no servidor, na hora de enviar. Nenhuma função deste
//   módulo devolve o token para fora — apenas `readOrganizationWhatsAppCredentials`
//   e exclusivamente para a rota de envio.
// - O índice único `uq_whatsapp_integrations_phone_number_id` (036) garante que
//   um número pertença a UMA organização. Colisão vira erro de negócio, não 500.
//
// HONESTIDADE (estrutura pendente): as migrations 030–037 podem ainda não estar
// aplicadas. Antes de qualquer leitura/gravação verificamos a estrutura com
// `readWhatsAppSchemaReadiness` e, quando ausente, devolvemos um estado/informação
// explícita de "pendente" em vez de falhar ou fingir sucesso.

import { sql } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/pg-errors";
import {
  decryptSecret,
  encryptSecret,
  readCredentialsKey,
} from "@/lib/communication/whatsapp-credentials";
import {
  WHATSAPP_INTEGRATION_PROVIDER,
  buildOrganizationIntegrationState,
  toIsoOrNull,
  type OrganizationWhatsAppIntegration,
  type WhatsAppIntegrationRow,
} from "@/lib/communication/whatsapp-integration";

// Quais partes da estrutura do banco já existem. `ready` é o mínimo necessário
// para ler/gravar a integração (tabela + coluna cifrada).
export type WhatsAppSchemaReadiness = {
  integrationTable: boolean;
  credentialColumn: boolean;
  communicationMessages: boolean;
  inboundColumns: boolean;
  ready: boolean;
};

export async function readWhatsAppSchemaReadiness(): Promise<WhatsAppSchemaReadiness> {
  const rows = (await sql`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'whatsapp_integrations'
      ) AS has_integration_table,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'whatsapp_integrations'
          AND column_name = 'access_token_encrypted'
      ) AS has_credential_column,
      EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'communication_messages'
      ) AS has_messages_table,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'communication_messages'
          AND column_name = 'sender_phone'
      ) AS has_inbound_columns
  `) as {
    has_integration_table: boolean;
    has_credential_column: boolean;
    has_messages_table: boolean;
    has_inbound_columns: boolean;
  }[];

  const row = rows[0];
  const integrationTable = Boolean(row?.has_integration_table);
  const credentialColumn = Boolean(row?.has_credential_column);

  return {
    integrationTable,
    credentialColumn,
    communicationMessages: Boolean(row?.has_messages_table),
    inboundColumns: Boolean(row?.has_inbound_columns),
    ready: integrationTable && credentialColumn,
  };
}

// Localiza a organização dona de um `phone_number_id`. Exige correspondência
// INEQUÍVOCA (exatamente uma linha) para nunca associar o evento à empresa
// errada. Fonte única usada pela integração e pelo webhook de entrada.
export async function resolveOrganizationIdByPhoneNumberId(
  phoneNumberId: string
): Promise<string | null> {
  const rows = (await sql`
    SELECT organization_id
    FROM whatsapp_integrations
    WHERE provider = ${WHATSAPP_INTEGRATION_PROVIDER}
      AND phone_number_id = ${phoneNumberId}
    LIMIT 2
  `) as { organization_id: string }[];

  return rows.length === 1 ? rows[0].organization_id : null;
}

// Estado público da conexão da organização. Nunca expõe o token.
export async function getOrganizationIntegration(
  organizationId: string
): Promise<OrganizationWhatsAppIntegration> {
  const readiness = await readWhatsAppSchemaReadiness();
  if (!readiness.ready) {
    return buildOrganizationIntegrationState({ ready: false, row: null });
  }

  const rows = (await sql`
    SELECT
      status,
      phone_number_id,
      business_account_id,
      display_phone_number,
      verified_name,
      webhook_configured,
      token_expires_at,
      connected_at,
      disconnected_at,
      last_webhook_at,
      last_checked_at,
      last_error,
      access_token_encrypted
    FROM whatsapp_integrations
    WHERE organization_id = ${organizationId}
      AND provider = ${WHATSAPP_INTEGRATION_PROVIDER}
    LIMIT 1
  `) as WhatsAppIntegrationRow[];

  return buildOrganizationIntegrationState({
    ready: true,
    row: rows[0] ?? null,
  });
}

// Grava/conecta a integração da organização. Cifra o token antes de gravar; se
// a chave não estiver configurada, NÃO grava em texto puro (devolve KEY_MISSING).
export type ConnectOrganizationIntegrationInput = {
  organizationId: string;
  accessToken: string;
  tokenExpiresInSeconds: number | null;
  phoneNumberId: string;
  businessAccountId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  webhookConfigured: boolean;
};

export type ConnectOrganizationIntegrationResult =
  | { ok: true; integration: OrganizationWhatsAppIntegration }
  | {
      ok: false;
      code: "SCHEMA_PENDING" | "KEY_MISSING" | "PHONE_NUMBER_IN_USE" | "FAILED";
      message: string;
    };

export async function connectOrganizationIntegration(
  input: ConnectOrganizationIntegrationInput
): Promise<ConnectOrganizationIntegrationResult> {
  const readiness = await readWhatsAppSchemaReadiness();
  if (!readiness.ready) {
    return {
      ok: false,
      code: "SCHEMA_PENDING",
      message:
        "A estrutura de conexão do WhatsApp ainda não está aplicada no banco (migrations pendentes).",
    };
  }

  const key = readCredentialsKey();
  if (!key) {
    return {
      ok: false,
      code: "KEY_MISSING",
      message:
        "A chave de criptografia das credenciais (WHATSAPP_CREDENTIALS_KEY) não está configurada no servidor.",
    };
  }

  const encrypted = encryptSecret(input.accessToken, key);
  const tokenExpiresAt =
    input.tokenExpiresInSeconds && input.tokenExpiresInSeconds > 0
      ? new Date(
          Date.now() + input.tokenExpiresInSeconds * 1000
        ).toISOString()
      : null;

  try {
    const rows = (await sql`
      INSERT INTO whatsapp_integrations (
        organization_id,
        provider,
        phone_number_id,
        business_account_id,
        display_phone_number,
        verified_name,
        access_token_encrypted,
        status,
        webhook_configured,
        token_expires_at,
        connected_at,
        disconnected_at,
        last_checked_at,
        last_error,
        updated_at
      ) VALUES (
        ${input.organizationId},
        ${WHATSAPP_INTEGRATION_PROVIDER},
        ${input.phoneNumberId},
        ${input.businessAccountId},
        ${input.displayPhoneNumber},
        ${input.verifiedName},
        ${encrypted},
        'connected',
        ${input.webhookConfigured},
        ${tokenExpiresAt}::timestamptz,
        NOW(),
        NULL,
        NOW(),
        NULL,
        NOW()
      )
      ON CONFLICT (organization_id, provider) DO UPDATE SET
        phone_number_id = EXCLUDED.phone_number_id,
        business_account_id = EXCLUDED.business_account_id,
        display_phone_number = EXCLUDED.display_phone_number,
        verified_name = EXCLUDED.verified_name,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        status = 'connected',
        webhook_configured = EXCLUDED.webhook_configured,
        token_expires_at = EXCLUDED.token_expires_at,
        connected_at = NOW(),
        disconnected_at = NULL,
        last_checked_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
      RETURNING
        status,
        phone_number_id,
        business_account_id,
        display_phone_number,
        verified_name,
        webhook_configured,
        token_expires_at,
        connected_at,
        disconnected_at,
        last_webhook_at,
        last_checked_at,
        last_error,
        access_token_encrypted
    `) as WhatsAppIntegrationRow[];

    return {
      ok: true,
      integration: buildOrganizationIntegrationState({
        ready: true,
        row: rows[0] ?? null,
      }),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        code: "PHONE_NUMBER_IN_USE",
        message:
          "Este número de WhatsApp já está conectado a outra conta no EstetiQI.",
      };
    }
    throw error;
  }
}

// Desconecta a organização: apaga o token cifrado e marca o estado. Não apaga a
// linha (preserva histórico/auditoria) nem dados de clientes.
export async function disconnectOrganizationIntegration(
  organizationId: string
): Promise<{ ok: true; integration: OrganizationWhatsAppIntegration }> {
  const readiness = await readWhatsAppSchemaReadiness();
  if (!readiness.ready) {
    return {
      ok: true,
      integration: buildOrganizationIntegrationState({
        ready: false,
        row: null,
      }),
    };
  }

  const rows = (await sql`
    UPDATE whatsapp_integrations
    SET status = 'disconnected',
        access_token_encrypted = NULL,
        token_expires_at = NULL,
        disconnected_at = NOW(),
        last_error = NULL,
        updated_at = NOW()
    WHERE organization_id = ${organizationId}
      AND provider = ${WHATSAPP_INTEGRATION_PROVIDER}
    RETURNING
      status,
      phone_number_id,
      business_account_id,
      display_phone_number,
      verified_name,
      webhook_configured,
      token_expires_at,
      connected_at,
      disconnected_at,
      last_webhook_at,
      last_checked_at,
      last_error,
      access_token_encrypted
  `) as WhatsAppIntegrationRow[];

  return {
    ok: true,
    integration: buildOrganizationIntegrationState({
      ready: true,
      row: rows[0] ?? null,
    }),
  };
}
// Lê (e decifra) as credenciais da organização para USO EXCLUSIVO da rota de
// envio. É a ÚNICA função que devolve o token em claro, e apenas para o
// servidor. Nunca deve ser usada para montar respostas HTTP públicas.
export type WhatsAppCredentialsResult =
  | { ok: true; accessToken: string; phoneNumberId: string }
  | {
      ok: false;
      code:
        | "SCHEMA_PENDING"
        | "KEY_MISSING"
        | "NOT_CONNECTED"
        | "DECRYPT_FAILED";
      message: string;
    };

export async function readOrganizationWhatsAppCredentials(
  organizationId: string
): Promise<WhatsAppCredentialsResult> {
  const readiness = await readWhatsAppSchemaReadiness();
  if (!readiness.ready) {
    return {
      ok: false,
      code: "SCHEMA_PENDING",
      message:
        "A estrutura de conexão do WhatsApp ainda não está aplicada no banco.",
    };
  }

  const rows = (await sql`
    SELECT status, phone_number_id, access_token_encrypted, token_expires_at
    FROM whatsapp_integrations
    WHERE organization_id = ${organizationId}
      AND provider = ${WHATSAPP_INTEGRATION_PROVIDER}
    LIMIT 1
  `) as {
    status: string | null;
    phone_number_id: string | null;
    access_token_encrypted: string | null;
    token_expires_at: string | Date | null;
  }[];

  const row = rows[0];
  if (
    !row ||
    row.status !== "connected" ||
    !row.access_token_encrypted ||
    !row.phone_number_id
  ) {
    return {
      ok: false,
      code: "NOT_CONNECTED",
      message: "Nenhum número de WhatsApp está conectado para esta conta.",
    };
  }

  const expiresAt = toIsoOrNull(row.token_expires_at);
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return {
      ok: false,
      code: "NOT_CONNECTED",
      message:
        "A autorização do WhatsApp expirou. Reconecte o número para voltar a enviar.",
    };
  }

  const key = readCredentialsKey();
  if (!key) {
    return {
      ok: false,
      code: "KEY_MISSING",
      message:
        "A chave de criptografia das credenciais não está configurada no servidor.",
    };
  }

  const accessToken = decryptSecret(row.access_token_encrypted, key);
  if (!accessToken) {
    return {
      ok: false,
      code: "DECRYPT_FAILED",
      message:
        "Não foi possível ler a credencial armazenada. Reconecte o número.",
    };
  }

  return { ok: true, accessToken, phoneNumberId: row.phone_number_id };
}

// Marca o recebimento de um webhook da Meta para os números informados. É apenas
// o registro de "visto por último": BEST-EFFORT (o chamador ignora falhas) e
// nunca deve derrubar o processamento do webhook em si.
export async function touchIntegrationWebhooks(
  phoneNumberIds: string[]
): Promise<void> {
  const unique = [...new Set(phoneNumberIds.filter((id) => Boolean(id)))];
  if (unique.length === 0) return;

  for (const phoneNumberId of unique) {
    await sql`
      UPDATE whatsapp_integrations
      SET last_webhook_at = NOW(), updated_at = NOW()
      WHERE provider = ${WHATSAPP_INTEGRATION_PROVIDER}
        AND phone_number_id = ${phoneNumberId}
    `;
  }
}


