-- 027: conversa (mensagens) das solicitações de suporte.
--
-- Uma solicitação em support_requests ganha várias support_messages. Cada
-- mensagem identifica o autor por tipo: 'customer' (usuário da organização que
-- abriu o ticket) ou 'support' (equipe EstetiQI / responsável pela plataforma).
--
-- A FK composta (request_id, organization_id) reaproveita o UNIQUE
-- (id, organization_id) já existente em support_requests (migration 026) e
-- garante NO BANCO que a mensagem pertence à mesma organização do ticket,
-- preservando o isolamento multi-tenant sem recriar tabelas nem apagar dados.
--
-- Idempotente: CREATE ... IF NOT EXISTS e constraints declaradas no próprio
-- CREATE TABLE. Reexecutar este arquivo é inofensivo.

CREATE TABLE IF NOT EXISTS support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    request_id UUID NOT NULL,

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    author_type VARCHAR(20) NOT NULL,

    -- Usuário interno que escreveu. Para respostas da equipe pode ser nulo
    -- (o responsável pela plataforma é identificado pelo e-mail), por isso
    -- ON DELETE SET NULL em vez de CASCADE.
    author_user_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    author_email VARCHAR(320),

    body TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT support_messages_author_type_check
        CHECK (author_type IN ('customer', 'support')),

    CONSTRAINT support_messages_body_check
        CHECK (char_length(btrim(body)) > 0),

    CONSTRAINT support_messages_id_org_unique
        UNIQUE (id, organization_id),

    CONSTRAINT support_messages_request_fk
        FOREIGN KEY (request_id, organization_id)
        REFERENCES support_requests (id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_messages_request_id
    ON support_messages(request_id);

CREATE INDEX IF NOT EXISTS idx_support_messages_request_created_at
    ON support_messages(request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_support_messages_organization_created_at
    ON support_messages(organization_id, created_at);
