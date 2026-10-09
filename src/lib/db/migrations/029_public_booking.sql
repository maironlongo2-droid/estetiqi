-- 029: cartão digital público e agendamento online.
-- Incremental e idempotente: apenas adiciona colunas de apresentação pública na
-- tabela existente `organizations` (não remove, não recria e não apaga dados).
--
-- `public_slug` é o identificador público da página do negócio
-- (ex.: /agendar/<public_slug>). É separado do `slug` interno, que continua
-- sendo a chave de vínculo com o Clerk. Fica NULO enquanto o cartão não for
-- publicado e `public_published` controla a visibilidade pública da página.
--
-- Os campos `public_headline`, `public_bio` e `public_instagram` são a
-- apresentação pública. O contato público reaproveita `business_phone` e o
-- endereço reaproveita `city`/`state` (já existentes na tabela).

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS public_slug VARCHAR(120),
    ADD COLUMN IF NOT EXISTS public_published BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS public_headline VARCHAR(160),
    ADD COLUMN IF NOT EXISTS public_bio TEXT,
    ADD COLUMN IF NOT EXISTS public_instagram VARCHAR(120);

-- Unicidade case-insensitive do endereço público. O índice é parcial: pode
-- existir mais de uma organização sem cartão publicado (public_slug NULO).
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_public_slug
    ON organizations (LOWER(public_slug))
    WHERE public_slug IS NOT NULL;
