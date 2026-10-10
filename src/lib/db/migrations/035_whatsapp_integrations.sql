-- 035: conexões da WhatsApp Business Cloud API (Meta) por organização.
--
-- ADITIVA: cria apenas a tabela de configuração e seus índices.
--
-- SEGURANÇA: esta tabela NÃO guarda tokens em claro. As colunas terminadas em
-- _ref armazenam apenas uma REFERÊNCIA a um segredo mantido no servidor ou em um
-- serviço de gerenciamento de segredos. A interface nunca exibe o segredo.
--
-- IMPORTANTE: esta migration NÃO deve ser aplicada em produção nesta tarefa.
-- Enquanto não for aplicada, a Central de Comunicação mostra "Não configurado".

CREATE TABLE IF NOT EXISTS whatsapp_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    provider VARCHAR(40) NOT NULL DEFAULT 'whatsapp_cloud_api',
    phone_number_id VARCHAR(64),
    business_account_id VARCHAR(64),
    display_phone_number VARCHAR(30),
    verified_name VARCHAR(160),
    access_token_ref VARCHAR(255),
    verify_token_ref VARCHAR(255),
    app_secret_ref VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'not_configured',
    webhook_configured BOOLEAN NOT NULL DEFAULT FALSE,
    last_checked_at TIMESTAMPTZ,
    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT whatsapp_integrations_status_check
        CHECK (status IN ('not_configured', 'pending', 'connected', 'error'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_integrations_organization
    ON whatsapp_integrations(organization_id, provider);
