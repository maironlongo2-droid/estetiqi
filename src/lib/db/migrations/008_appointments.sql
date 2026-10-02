CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    client_id UUID NOT NULL
        REFERENCES clients(id)
        ON DELETE RESTRICT,

    procedure_id UUID
        REFERENCES procedures(id)
        ON DELETE RESTRICT,

    professional_name VARCHAR(120),

    starts_at TIMESTAMPTZ NOT NULL,

    ends_at TIMESTAMPTZ NOT NULL,

    price NUMERIC(12, 2),

    notes TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'scheduled',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT appointments_status_check
        CHECK (
            status IN (
                'scheduled',
                'confirmed',
                'completed',
                'cancelled',
                'no_show'
            )
        ),

    CONSTRAINT appointments_price_check
        CHECK (
            price IS NULL
            OR price >= 0
        ),

    CONSTRAINT appointments_time_check
        CHECK (
            ends_at > starts_at
        )
);

CREATE INDEX IF NOT EXISTS idx_appointments_organization_id
    ON appointments(organization_id);

CREATE INDEX IF NOT EXISTS idx_appointments_organization_starts_at
    ON appointments(organization_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_appointments_client_id
    ON appointments(client_id);

CREATE INDEX IF NOT EXISTS idx_appointments_procedure_id
    ON appointments(procedure_id);

CREATE INDEX IF NOT EXISTS idx_appointments_status
    ON appointments(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_appointments_professional
    ON appointments(organization_id, professional_name);
