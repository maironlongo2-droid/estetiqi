DROP INDEX IF EXISTS uq_procedures_organization_name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_procedures_organization_active_name
    ON procedures(organization_id, LOWER(name))
    WHERE status = 'active';
