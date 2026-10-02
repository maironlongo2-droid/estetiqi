CREATE TABLE IF NOT EXISTS procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    name VARCHAR(120) NOT NULL,

    description TEXT,

    price NUMERIC(12, 2),

    duration_minutes INTEGER,

    return_interval_days INTEGER,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT procedures_status_check
        CHECK (status IN ('active', 'inactive')),

    CONSTRAINT procedures_price_check
        CHECK (price IS NULL OR price >= 0),

    CONSTRAINT procedures_duration_check
        CHECK (
            duration_minutes IS NULL
            OR duration_minutes > 0
        ),

    CONSTRAINT procedures_return_interval_check
        CHECK (
            return_interval_days IS NULL
            OR return_interval_days > 0
        )
);

CREATE INDEX IF NOT EXISTS idx_procedures_organization_id
    ON procedures(organization_id);

CREATE INDEX IF NOT EXISTS idx_procedures_organization_status
    ON procedures(organization_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_procedures_organization_name
    ON procedures(organization_id, name);
