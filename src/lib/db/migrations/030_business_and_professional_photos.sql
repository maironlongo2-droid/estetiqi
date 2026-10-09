-- 030: fotos do negócio (logo) e das profissionais no cartão digital.
-- Incremental e idempotente: apenas adiciona colunas de imagem binária (BYTEA)
-- nas tabelas existentes `organizations` e `professionals`. Não remove, não
-- recria e não apaga dados; não altera foreign keys, RBAC nem o isolamento por
-- organização.
--
-- As imagens são armazenadas no próprio PostgreSQL/Neon, que já é o
-- armazenamento persistente do produto. Isso evita serviço externo pago no MVP
-- e garante que as fotos não desapareçam em um novo deploy. As imagens são
-- redimensionadas no navegador antes do envio (ver src/lib/images/downscale.ts),
-- então cada registro ocupa poucos KB. O `*_mime_type` guarda o tipo real
-- (image/jpeg, image/png ou image/webp) e o `*_updated_at` permite cache-busting
-- da URL pública sem expor o binário.

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS logo_image BYTEA,
    ADD COLUMN IF NOT EXISTS logo_mime_type VARCHAR(40),
    ADD COLUMN IF NOT EXISTS logo_updated_at TIMESTAMPTZ;

ALTER TABLE professionals
    ADD COLUMN IF NOT EXISTS photo_image BYTEA,
    ADD COLUMN IF NOT EXISTS photo_mime_type VARCHAR(40),
    ADD COLUMN IF NOT EXISTS photo_updated_at TIMESTAMPTZ;
