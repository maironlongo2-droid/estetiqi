-- 033: histórico persistente de comunicação (mensagens enviadas e recebidas).
--
-- ADITIVA: cria apenas a tabela de histórico e seus índices. Não altera tabelas
-- existentes e não apaga dados. As colunas de cliente, atendimento e procedimento
-- são opcionais e validadas por chave estrangeira composta (id, organization_id),
-- garantindo que uma organização nunca referencie dados de outra.
--
-- IMPORTANTE: esta migration NÃO deve ser aplicada em produção nesta tarefa.
-- Enquanto não for aplicada, a Central de Comunicação mostra que o histórico
-- persistente ainda não está ativo (nenhum dado é inventado).

CREATE TABLE IF NOT EXISTS communication_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    client_id UUID,
    appointment_id UUID,
    procedure_id UUID,

    channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',
    direction VARCHAR(10) NOT NULL DEFAULT 'outbound',
    category VARCHAR(30) NOT NULL DEFAULT 'transacional',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    body TEXT,
    provider_message_id VARCHAR(255),
    error_message TEXT,
    source VARCHAR(40) NOT NULL DEFAULT 'central_comunicacao',
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT communication_messages_channel_check
        CHECK (channel IN ('whatsapp')),

    CONSTRAINT communication_messages_direction_check
        CHECK (direction IN ('outbound', 'inbound')),

    CONSTRAINT communication_messages_category_check
        CHECK (category IN ('transacional', 'pos_atendimento', 'promocional')),

    CONSTRAINT communication_messages_status_check
        CHECK (status IN (
            'draft',
            'prepared',
            'whatsapp_opened',
            'queued',
            'sent',
            'delivered',
            'read',
            'failed',
            'cancelled'
        ))
);

CREATE INDEX IF NOT EXISTS idx_communication_messages_organization
    ON communication_messages(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_messages_client
    ON communication_messages(organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_communication_messages_status
    ON communication_messages(organization_id, status);

-- Idempotência de webhooks: o mesmo provider_message_id não é registrado duas
-- vezes para a mesma organização.
CREATE UNIQUE INDEX IF NOT EXISTS uq_communication_messages_provider_id
    ON communication_messages(organization_id, provider_message_id)
    WHERE provider_message_id IS NOT NULL;

ALTER TABLE communication_messages
    ADD CONSTRAINT communication_messages_client_org_fk
        FOREIGN KEY (client_id, organization_id)
        REFERENCES clients (id, organization_id)
        ON DELETE SET NULL (client_id) NOT VALID;

ALTER TABLE communication_messages
    ADD CONSTRAINT communication_messages_appointment_org_fk
        FOREIGN KEY (appointment_id, organization_id)
        REFERENCES appointments (id, organization_id)
        ON DELETE SET NULL (appointment_id) NOT VALID;

ALTER TABLE communication_messages
    ADD CONSTRAINT communication_messages_procedure_org_fk
        FOREIGN KEY (procedure_id, organization_id)
        REFERENCES procedures (id, organization_id)
        ON DELETE SET NULL (procedure_id) NOT VALID;
