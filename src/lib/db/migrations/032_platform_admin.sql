-- 032: administracao da plataforma (estado das organizacoes e auditoria).
-- Incremental e aditivo: adiciona colunas de estado/assinatura em
-- `organizations` e cria a tabela de auditoria `platform_admin_actions`.
-- Nao remove, nao recria e nao apaga dados. Nao altera foreign keys, RBAC nem o
-- isolamento por organization_id.
--
-- `status` e o estado operacional da organizacao visto pela EstetiQI:
-- 'active' (padrao) ou 'blocked'. Uma organizacao bloqueada tem o acesso negado
-- no servidor pelas APIs autenticadas, mas TODOS os seus dados sao preservados
-- (o bloqueio nao remove registros).
--
-- `blocked_at`, `blocked_reason` e `blocked_by` guardam a ultima acao de
-- bloqueio (data, motivo e e-mail do administrador responsavel).
--
-- `subscribed_at` e `subscription_canceled_at` registram, de forma confiavel e
-- a partir de agora, quando uma organizacao virou assinante e quando cancelou.
-- Ficam NULOS para as organizacoes antigas: nenhum valor historico e inventado.
--
-- `acquisition_source` guarda a origem (convite/indicacao) quando ela for
-- registrada. Campo opcional.

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
    ADD COLUMN IF NOT EXISTS blocked_by VARCHAR(255),
    ADD COLUMN IF NOT EXISTS subscribed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS subscription_canceled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS acquisition_source VARCHAR(60);

ALTER TABLE organizations
    ADD CONSTRAINT organizations_status_check
    CHECK (status IN ('active', 'blocked'));

CREATE TABLE IF NOT EXISTS platform_admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,
    action VARCHAR(40) NOT NULL,
    reason TEXT,
    actor_email VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_actions_organization
    ON platform_admin_actions (organization_id, created_at DESC);
