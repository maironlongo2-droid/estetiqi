CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    name VARCHAR(120) NOT NULL,

    phone VARCHAR(30),

    email VARCHAR(255),

    cpf VARCHAR(14),

    birth_date DATE,

    notes TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'active',

    source VARCHAR(50),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT clients_status_check
        CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_clients_organization_id
    ON clients(organization_id);

CREATE INDEX IF NOT EXISTS idx_clients_organization_phone
    ON clients(organization_id, phone);

CREATE INDEX IF NOT EXISTS idx_clients_organization_email
    ON clients(organization_id, email);

CREATE INDEX IF NOT EXISTS idx_clients_organization_cpf
    ON clients(organization_id, cpf);