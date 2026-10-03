CREATE TABLE IF NOT EXISTS ai_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    type VARCHAR(60) NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_opportunities_priority_check
        CHECK (priority IN ('low','medium','high')),
    CONSTRAINT ai_opportunities_status_check
        CHECK (status IN ('open','approved','dismissed','completed'))
);

CREATE INDEX IF NOT EXISTS idx_ai_opportunities_organization_id
    ON ai_opportunities(organization_id);

CREATE INDEX IF NOT EXISTS idx_ai_opportunities_status
    ON ai_opportunities(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_opportunities_priority
    ON ai_opportunities(organization_id, priority);
