-- 036: mensagens RECEBIDAS do WhatsApp (webhook da Meta) na Central de
-- Comunicação.
--
-- ADITIVA e não destrutiva. Reutiliza a tabela `communication_messages` da
-- migration 033 (não cria tabela paralela) e completa o que falta para registrar
-- mensagens de CLIENTE (inbound):
--
--   1. Amplia as restrições de `category` e `status` para admitir os valores de
--      uma mensagem recebida ('atendimento' e 'received'). As listas continuam
--      sendo um SUPERCONJUNTO das anteriores: nenhum registro existente fica
--      inválido e nada é apagado.
--   2. Adiciona as colunas específicas do inbound:
--        message_type              - tipo informado pela Meta (text, image, ...)
--        event_at                  - data/hora do evento segundo a Meta
--        whatsapp_phone_number_id  - número que RECEBEU (metadata.phone_number_id)
--        sender_phone              - número (wa_id) de quem enviou
--        metadata                  - metadados mínimos para uso futuro
--   3. Cria o índice de listagem da futura caixa de entrada.
--   4. Garante que cada `phone_number_id` da Meta pertença a UMA única
--      integração/empresa. Isso impede que um número seja associado a duas
--      organizações e torna o roteamento do webhook inequívoco. Não altera a
--      migration 035 (que só cria a tabela): o índice vem nesta migration.
--
-- A idempotência já é garantida pelo índice único existente na 033
-- (`uq_communication_messages_provider_id`, em organization_id +
-- provider_message_id): o mesmo evento reenviado pela Meta não gera duplicata.
--
-- IMPORTANTE: esta migration NÃO deve ser aplicada em produção nesta tarefa.

ALTER TABLE communication_messages
    DROP CONSTRAINT IF EXISTS communication_messages_category_check;

ALTER TABLE communication_messages
    ADD CONSTRAINT communication_messages_category_check
        CHECK (category IN (
            'transacional',
            'pos_atendimento',
            'promocional',
            'atendimento'
        ));

ALTER TABLE communication_messages
    DROP CONSTRAINT IF EXISTS communication_messages_status_check;

ALTER TABLE communication_messages
    ADD CONSTRAINT communication_messages_status_check
        CHECK (status IN (
            'draft',
            'prepared',
            'whatsapp_opened',
            'queued',
            'sent',
            'delivered',
            'read',
            'failed',
            'cancelled',
            'received'
        ));

ALTER TABLE communication_messages
    ADD COLUMN IF NOT EXISTS message_type VARCHAR(30),
    ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id VARCHAR(64),
    ADD COLUMN IF NOT EXISTS sender_phone VARCHAR(30),
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_communication_messages_direction
    ON communication_messages(organization_id, direction, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_integrations_phone_number_id
    ON whatsapp_integrations(phone_number_id)
    WHERE phone_number_id IS NOT NULL;
