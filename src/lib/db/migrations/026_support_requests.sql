-- 026: solicitações de ajuda e suporte enviadas pelos próprios usuários.
-- Cada solicitação guarda a organização e o usuário autenticados no momento do
-- envio (nunca valores vindos do navegador). A FK composta para memberships
-- garante no banco que o par (organização, usuário) é um vínculo real.
--
-- Idempotente: CREATE ... IF NOT EXISTS e constraints declaradas no próprio
-- CREATE TABLE. Reexecutar este arquivo é inofensivo.

CREATE TABLE IF NOT EXISTS support_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,

    category VARCHAR(40) NOT NULL,

    subject VARCHAR(160) NOT NULL,

    description TEXT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'open',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT support_requests_status_check
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),

    CONSTRAINT support_requests_category_check
        CHECK (category IN ('technical', 'schedule', 'clients', 'finance', 'account', 'other')),

    CONSTRAINT support_requests_id_org_unique
        UNIQUE (id, organization_id),

    CONSTRAINT support_requests_membership_fk
        FOREIGN KEY (organization_id, user_id)
        REFERENCES memberships (organization_id, user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_requests_organization_id
    ON support_requests(organization_id);

CREATE INDEX IF NOT EXISTS idx_support_requests_organization_user
    ON support_requests(organization_id, user_id);

CREATE INDEX IF NOT EXISTS idx_support_requests_organization_status
    ON support_requests(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_support_requests_organization_created_at
    ON support_requests(organization_id, created_at);
