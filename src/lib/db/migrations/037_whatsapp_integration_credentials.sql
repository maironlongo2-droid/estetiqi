-- 037: credenciais protegidas e ciclo de vida da conexão oficial do WhatsApp
-- Business Platform (Meta) por organização.
--
-- ADITIVA e NÃO DESTRUTIVA. Reutiliza a tabela `whatsapp_integrations` criada na
-- migration 035 (não cria tabela paralela) e acrescenta o que falta para o fluxo
-- oficial de Embedded Signup com MÚLTIPLAS organizações:
--
--   1. `access_token_encrypted` — token de acesso da organização, CIFRADO em
--      repouso (AES-256-GCM; ver src/lib/communication/whatsapp-credentials.ts).
--      Substitui o uso de `access_token_ref` para este fluxo: o segredo deixa de
--      depender de um cofre externo e passa a ser protegido no próprio banco com
--      chave vinda de `WHATSAPP_CREDENTIALS_KEY`. A coluna NUNCA guarda texto puro.
--   2. `token_expires_at` — quando o token expira (a Meta informa na troca).
--   3. `connected_at` / `disconnected_at` — marcos de conexão/desconexão.
--   4. `last_webhook_at` — último evento de webhook recebido para a integração.
--   5. Amplia a restrição de `status` para admitir os estados reais do ciclo de
--      vida ('disconnected', 'revoked', 'incomplete'). A lista é um SUPERCONJUNTO
--      da anterior: nenhum registro existente fica inválido e nada é apagado.
--
-- IMPORTANTE: esta migration NÃO deve ser aplicada em produção nesta tarefa.
-- Enquanto não for aplicada no ambiente local, a aplicação detecta a ausência e
-- mostra o estado honesto ("estrutura pendente"), sem gravar credenciais.

ALTER TABLE whatsapp_integrations
    ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS disconnected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

ALTER TABLE whatsapp_integrations
    DROP CONSTRAINT IF EXISTS whatsapp_integrations_status_check;

ALTER TABLE whatsapp_integrations
    ADD CONSTRAINT whatsapp_integrations_status_check
        CHECK (status IN (
            'not_configured',
            'pending',
            'connected',
            'error',
            'incomplete',
            'disconnected',
            'revoked'
        ));
