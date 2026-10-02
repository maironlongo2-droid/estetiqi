ALTER TABLE clients
ADD CONSTRAINT clients_id_organization_unique
UNIQUE (id, organization_id);

ALTER TABLE procedures
ADD CONSTRAINT procedures_id_organization_unique
UNIQUE (id, organization_id);

ALTER TABLE appointments
ADD CONSTRAINT appointments_client_organization_fk
FOREIGN KEY (client_id, organization_id)
REFERENCES clients(id, organization_id)
ON DELETE RESTRICT;

ALTER TABLE appointments
ADD CONSTRAINT appointments_procedure_organization_fk
FOREIGN KEY (procedure_id, organization_id)
REFERENCES procedures(id, organization_id)
ON DELETE RESTRICT;
