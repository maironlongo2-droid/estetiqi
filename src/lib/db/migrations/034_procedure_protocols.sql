-- 034: Protocolos de Procedimentos (documentos PDF por procedimento).
--
-- ADITIVA e idempotente: cria apenas tabelas novas de metadados/estado e seus
-- índices. NÃO remove, NÃO recria e NÃO apaga dados existentes. Não altera RBAC,
-- autenticação nem o isolamento entre organizações (a associação é sempre
-- validada por organização + procedimento).
--
-- REVISÃO (protocolos entraram no escopo): a primeira versão previa que o arquivo
-- ficaria em um bucket externo e que o banco guardaria somente a referência
-- (`storage_key`). O projeto NÃO possui serviço de armazenamento de objetos
-- configurado: o armazenamento persistente do produto é o próprio PostgreSQL/Neon
-- (ver 030, que guarda logo e fotos em BYTEA). Para a funcionalidade funcionar de
-- ponta a ponta sem inventar credenciais de terceiros, o PDF é gravado como
-- binário no próprio banco (`file_data BYTEA`), seguindo exatamente o padrão já
-- usado pelas imagens. `storage_key` continua na tabela, agora NULLABLE, para o dia
-- em que um bucket for configurado: nesse caso o arquivo passa a viver no bucket, a
-- coluna guarda a chave do objeto e `file_data` deixa de ser usada.
--
-- LIMITE: 5 MB por PDF, validado no navegador e novamente no servidor
-- (ver src/lib/protocols/limits.ts). Nenhum base64 em coluna de texto é usado:
-- BYTEA é binário e o TOAST do PostgreSQL mantém o registro principal enxuto.
--
-- IMPORTANTE: esta migration NÃO deve ser aplicada em produção nesta tarefa.
-- Enquanto não for aplicada, a área de Procedimentos mostra explicitamente que o
-- recurso está aguardando a aplicação da migration (nada é simulado).

CREATE TABLE IF NOT EXISTS procedure_protocols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    procedure_id UUID NOT NULL,

    name VARCHAR(160) NOT NULL,
    description TEXT,

    -- 'pre' = orientações pré-procedimento; 'post' = cuidados pós-procedimento.
    protocol_kind VARCHAR(8) NOT NULL DEFAULT 'pre',

    -- Envio automático configurado pela clínica. O MOMENTO do envio é derivado do
    -- protocol_kind: 'pre' após a confirmação do agendamento, 'post' após o
    -- atendimento ser concluído.
    auto_send BOOLEAN NOT NULL DEFAULT FALSE,

    mime_type VARCHAR(120) NOT NULL DEFAULT 'application/pdf',
    size_bytes BIGINT NOT NULL,
    file_data BYTEA NOT NULL,

    -- Reservado para uma futura migração a um bucket de objetos (hoje NULL).
    storage_key VARCHAR(512),

    version INTEGER NOT NULL DEFAULT 1,
    is_current BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT procedure_protocols_kind_check
        CHECK (protocol_kind IN ('pre', 'post')),

    CONSTRAINT procedure_protocols_size_check
        CHECK (size_bytes > 0 AND size_bytes <= 5242880),

    CONSTRAINT procedure_protocols_version_check
        CHECK (version > 0)
);

CREATE INDEX IF NOT EXISTS idx_procedure_protocols_organization
    ON procedure_protocols(organization_id, procedure_id);

-- Apenas uma versão vigente (is_current) por procedimento dentro da organização.
CREATE UNIQUE INDEX IF NOT EXISTS uq_procedure_protocols_current
    ON procedure_protocols(organization_id, procedure_id)
    WHERE is_current;

ALTER TABLE procedure_protocols
    DROP CONSTRAINT IF EXISTS procedure_protocols_procedure_org_fk;

ALTER TABLE procedure_protocols
    ADD CONSTRAINT procedure_protocols_procedure_org_fk
        FOREIGN KEY (procedure_id, organization_id)
        REFERENCES procedures (id, organization_id)
        ON DELETE CASCADE NOT VALID;

-- Estado de cada tentativa de envio do protocolo para uma cliente. Existe para
-- (1) mostrar o estado REAL do envio na tela e (2) impedir envio duplicado quando
-- o mesmo evento é reprocessado: o índice único parcial abaixo permite apenas um
-- registro por protocolo + agendamento + gatilho.
CREATE TABLE IF NOT EXISTS procedure_protocol_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    organization_id UUID NOT NULL
        REFERENCES organizations(id)
        ON DELETE CASCADE,

    protocol_id UUID NOT NULL
        REFERENCES procedure_protocols(id)
        ON DELETE CASCADE,

    appointment_id UUID,
    client_id UUID,

    -- 'pre_appointment' = após a confirmação; 'post_appointment' = após concluir.
    trigger_type VARCHAR(20) NOT NULL,

    channel VARCHAR(20) NOT NULL DEFAULT 'whatsapp',

    -- sent = provedor confirmou; unavailable = canal não conectado/configurado;
    -- failed = tentativa recusada ou sem confirmação do provedor;
    -- pending = tentativa registrada e ainda não concluída.
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    detail TEXT,
    provider_message_id VARCHAR(160),
    attempts INTEGER NOT NULL DEFAULT 1,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT procedure_protocol_deliveries_trigger_check
        CHECK (trigger_type IN ('pre_appointment', 'post_appointment')),

    CONSTRAINT procedure_protocol_deliveries_status_check
        CHECK (status IN ('pending', 'sent', 'failed', 'unavailable')),

    CONSTRAINT procedure_protocol_deliveries_appointment_fk
        FOREIGN KEY (appointment_id, organization_id)
        REFERENCES appointments (id, organization_id)
        ON DELETE CASCADE NOT VALID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_procedure_protocol_deliveries_once
    ON procedure_protocol_deliveries (protocol_id, appointment_id, trigger_type)
    WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_procedure_protocol_deliveries_protocol
    ON procedure_protocol_deliveries (organization_id, protocol_id, created_at DESC);
