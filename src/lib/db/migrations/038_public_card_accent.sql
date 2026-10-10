-- 038: cor de destaque do cartão digital público (modelo único do EstetiQI).
--
-- ADITIVA e idempotente: apenas adiciona uma coluna em `organizations`. Não
-- remove, não recria, não apaga dados, não altera RBAC nem o isolamento entre
-- organizações.
--
-- A coluna guarda SOMENTE a CHAVE de uma paleta fechada de seis cores
-- (`petroleo`, `salvia`, `rose`, `ameixa`, `azul`, `bronze` — ver
-- src/lib/public/accent.ts). O servidor valida a chave ao salvar e ao renderizar;
-- valores ausentes ou inválidos usam o padrão do aplicativo (`petroleo`). Nenhum
-- valor livre de CSS é aceito ou gravado, portanto o banco nunca injeta estilo na
-- página pública.
--
-- IMPORTANTE: não aplicar em produção nesta tarefa.

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS public_accent VARCHAR(20);

-- Foto de capa opcional do cartão público (imagem tratada no navegador e
-- recortada em 16:9 antes do envio; ver src/lib/images/downscale.ts). Fica no
-- mesmo armazenamento persistente do produto (PostgreSQL/Neon), como a logo e as
-- fotos das profissionais (030). Sem capa, o cartão gera um fundo a partir da
-- cor de destaque — nenhuma imagem quebrada é exibida.
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS public_cover_image BYTEA,
    ADD COLUMN IF NOT EXISTS public_cover_mime_type VARCHAR(40),
    ADD COLUMN IF NOT EXISTS public_cover_updated_at TIMESTAMPTZ;
