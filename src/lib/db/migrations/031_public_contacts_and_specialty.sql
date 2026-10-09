-- 031: contatos do cartao publico (WhatsApp e Google Maps) e especialidade das
-- profissionais. Incremental e idempotente: apenas adiciona colunas nas tabelas
-- existentes `organizations` e `professionals` (nao remove, nao recria e nao
-- apaga dados). Nao altera foreign keys, RBAC nem o isolamento por organizacao.
--
-- `public_whatsapp` guarda o numero comercial usado para gerar o link wa.me
-- (codigo do pais + DDD) e `public_maps_url` guarda o link legitimo de
-- compartilhamento do Google Maps. `specialty` guarda a profissao ou
-- especialidade principal da profissional (sua area de atuacao), que e separada
-- dos procedimentos realizados e continua sendo cadastrada a parte.

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS public_whatsapp VARCHAR(30),
    ADD COLUMN IF NOT EXISTS public_maps_url VARCHAR(500);

ALTER TABLE professionals
    ADD COLUMN IF NOT EXISTS specialty VARCHAR(80);
