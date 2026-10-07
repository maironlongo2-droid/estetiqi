-- 022: isolamento por organização para financeiro, eventos e IA.
-- Protege novas gravações sem exigir validação imediata dos dados antigos.

SELECT CAST(
  CASE
    WHEN current_setting('server_version_num')::int >= 150000 THEN '1'
    ELSE '0'
  END AS integer
);

ALTER TABLE appointments
    ADD CONSTRAINT appointments_id_org_unique UNIQUE (id, organization_id);

ALTER TABLE payments
    ADD CONSTRAINT payments_id_org_unique UNIQUE (id, organization_id);

ALTER TABLE ai_opportunities
    ADD CONSTRAINT ai_opportunities_id_org_unique UNIQUE (id, organization_id);

ALTER TABLE payments
    ADD CONSTRAINT payments_client_org_fk
        FOREIGN KEY (client_id, organization_id)
        REFERENCES clients (id, organization_id)
        ON DELETE RESTRICT NOT VALID;

ALTER TABLE payments
    ADD CONSTRAINT payments_appointment_org_fk
        FOREIGN KEY (appointment_id, organization_id)
        REFERENCES appointments (id, organization_id)
        ON DELETE SET NULL (appointment_id) NOT VALID;

ALTER TABLE payments
    ADD CONSTRAINT payments_procedure_org_fk
        FOREIGN KEY (procedure_id, organization_id)
        REFERENCES procedures (id, organization_id)
        ON DELETE SET NULL (procedure_id) NOT VALID;

ALTER TABLE customer_events
    ADD CONSTRAINT customer_events_client_org_fk
        FOREIGN KEY (client_id, organization_id)
        REFERENCES clients (id, organization_id)
        ON DELETE CASCADE NOT VALID;

ALTER TABLE customer_events
    ADD CONSTRAINT customer_events_appointment_org_fk
        FOREIGN KEY (appointment_id, organization_id)
        REFERENCES appointments (id, organization_id)
        ON DELETE SET NULL (appointment_id) NOT VALID;

ALTER TABLE customer_events
    ADD CONSTRAINT customer_events_payment_org_fk
        FOREIGN KEY (payment_id, organization_id)
        REFERENCES payments (id, organization_id)
        ON DELETE SET NULL (payment_id) NOT VALID;

ALTER TABLE ai_opportunities
    ADD CONSTRAINT ai_opportunities_client_org_fk
        FOREIGN KEY (client_id, organization_id)
        REFERENCES clients (id, organization_id)
        ON DELETE SET NULL (client_id) NOT VALID;

ALTER TABLE ai_actions
    ADD CONSTRAINT ai_actions_client_org_fk
        FOREIGN KEY (client_id, organization_id)
        REFERENCES clients (id, organization_id)
        ON DELETE SET NULL (client_id) NOT VALID;

ALTER TABLE ai_actions
    ADD CONSTRAINT ai_actions_opportunity_org_fk
        FOREIGN KEY (opportunity_id, organization_id)
        REFERENCES ai_opportunities (id, organization_id)
        ON DELETE SET NULL (opportunity_id) NOT VALID;
