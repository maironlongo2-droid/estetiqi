-- 028: múltiplos procedimentos por agendamento.
-- Incremental e idempotente: preserva os agendamentos existentes.
--
-- O campo `appointments.procedure_id` continua sendo o procedimento principal
-- (o primeiro selecionado) por compatibilidade. A tabela de junção
-- `appointment_procedures` guarda todos os procedimentos do atendimento, na
-- ordem escolhida, com isolamento por organização via chaves compostas.

CREATE TABLE IF NOT EXISTS appointment_procedures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,
    appointment_id UUID NOT NULL,
    procedure_id UUID NOT NULL,
    position SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT appointment_procedures_position_check
        CHECK (position >= 1),
    CONSTRAINT appointment_procedures_unique
        UNIQUE (appointment_id, procedure_id),
    CONSTRAINT appointment_procedures_appointment_org_fk
        FOREIGN KEY (appointment_id, organization_id)
        REFERENCES appointments (id, organization_id)
        ON DELETE CASCADE,
    CONSTRAINT appointment_procedures_procedure_org_fk
        FOREIGN KEY (procedure_id, organization_id)
        REFERENCES procedures (id, organization_id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_appointment_procedures_appointment
    ON appointment_procedures (organization_id, appointment_id);

CREATE INDEX IF NOT EXISTS idx_appointment_procedures_procedure
    ON appointment_procedures (organization_id, procedure_id);

-- Backfill idempotente: cria o vínculo principal para os agendamentos antigos
-- que possuem apenas `procedure_id`. Agendamentos já vinculados são ignorados.
INSERT INTO appointment_procedures (
    organization_id,
    appointment_id,
    procedure_id,
    position
)
SELECT
    a.organization_id,
    a.id,
    a.procedure_id,
    1
FROM appointments a
WHERE a.procedure_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM appointment_procedures ap
    WHERE ap.appointment_id = a.id
  )
ON CONFLICT (appointment_id, procedure_id) DO NOTHING;
