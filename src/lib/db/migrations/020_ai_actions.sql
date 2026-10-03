CREATE TABLE IF NOT EXISTS ai_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    opportunity_id UUID REFERENCES ai_opportunities(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    type VARCHAR(60) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_approval',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_actions_status_check
        CHECK (status IN (
            'pending_approval',
            'approved',
            'running',
            'completed',
            'failed',
            'cancelled'
        ))
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_organization_id
    ON ai_actions(organization_id);

CREATE INDEX IF NOT EXISTS idx_ai_actions_status
    ON ai_actions(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_ai_actions_opportunity_id
    ON ai_actions(opportunity_id);

CREATE INDEX IF NOT EXISTS idx_ai_actions_client_id
    ON ai_actions(organization_id, client_id);
