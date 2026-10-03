CREATE TABLE IF NOT EXISTS customer_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    event_type VARCHAR(60) NOT NULL,
    source VARCHAR(40) NOT NULL DEFAULT 'system',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_events_organization_id
    ON customer_events(organization_id);

CREATE INDEX IF NOT EXISTS idx_customer_events_client_id
    ON customer_events(organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_customer_events_type
    ON customer_events(organization_id, event_type);

CREATE INDEX IF NOT EXISTS idx_customer_events_created_at
    ON customer_events(organization_id, created_at);
