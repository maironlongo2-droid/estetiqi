CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    procedure_id UUID REFERENCES procedures(id) ON DELETE SET NULL,
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(30),
    status VARCHAR(20) NOT NULL DEFAULT 'paid',
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT payments_status_check
        CHECK (status IN ('pending','paid','cancelled','refunded'))
);

CREATE INDEX IF NOT EXISTS idx_payments_organization_id
    ON payments(organization_id);

CREATE INDEX IF NOT EXISTS idx_payments_organization_paid_at
    ON payments(organization_id, paid_at);

CREATE INDEX IF NOT EXISTS idx_payments_client_id
    ON payments(organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_payments_procedure_id
    ON payments(organization_id, procedure_id);

CREATE INDEX IF NOT EXISTS idx_payments_appointment_id
    ON payments(organization_id, appointment_id);
