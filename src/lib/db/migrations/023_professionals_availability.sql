CREATE TABLE professionals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(30),
    email VARCHAR(255),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, organization_id)
);

CREATE INDEX professionals_organization_active_idx
    ON professionals (organization_id, active, name);

CREATE TABLE professional_procedures (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL,
    procedure_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (professional_id, procedure_id),
    FOREIGN KEY (professional_id, organization_id)
        REFERENCES professionals (id, organization_id)
        ON DELETE CASCADE,
    FOREIGN KEY (procedure_id, organization_id)
        REFERENCES procedures (id, organization_id)
        ON DELETE CASCADE
);

CREATE TABLE professional_weekly_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    starts_at TIME NOT NULL,
    ends_at TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at > starts_at),
    UNIQUE (professional_id, weekday, starts_at, ends_at),
    FOREIGN KEY (professional_id, organization_id)
        REFERENCES professionals (id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX professional_weekly_availability_lookup_idx
    ON professional_weekly_availability (
        organization_id,
        professional_id,
        weekday
    );

CREATE TABLE professional_availability_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL,
    exception_date DATE NOT NULL,
    kind VARCHAR(12) NOT NULL CHECK (kind IN ('blocked', 'available')),
    starts_at TIME,
    ends_at TIME,
    reason VARCHAR(180),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((starts_at IS NULL) = (ends_at IS NULL)),
    CHECK (starts_at IS NULL OR ends_at > starts_at),
    CHECK (kind <> 'available' OR starts_at IS NOT NULL),
    FOREIGN KEY (professional_id, organization_id)
        REFERENCES professionals (id, organization_id)
        ON DELETE CASCADE
);

CREATE INDEX professional_availability_exceptions_lookup_idx
    ON professional_availability_exceptions (
        organization_id,
        professional_id,
        exception_date
    );

ALTER TABLE appointments
    ADD COLUMN professional_id UUID;

ALTER TABLE appointments
    ADD CONSTRAINT appointments_professional_organization_fk
        FOREIGN KEY (professional_id, organization_id)
        REFERENCES professionals (id, organization_id)
        ON DELETE SET NULL (professional_id);

CREATE INDEX appointments_professional_schedule_idx
    ON appointments (organization_id, professional_id, starts_at)
    WHERE professional_id IS NOT NULL
      AND status NOT IN ('cancelled', 'no_show');
