CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_organization_phone
    ON clients (organization_id, phone)
    WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_organization_email
    ON clients (organization_id, email)
    WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_organization_cpf
    ON clients (organization_id, cpf)
    WHERE cpf IS NOT NULL;