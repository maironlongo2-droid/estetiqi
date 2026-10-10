This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Regras operacionais do MVP

- Os horarios da Agenda respeitam a disponibilidade semanal da profissional. Uma excecao de disponibilidade substitui os horarios semanais naquele dia; bloqueios e atendimentos ativos prevalecem sobre essa disponibilidade.
- A duracao cadastrada no procedimento define o horario final do atendimento. O backend valida novamente disponibilidade, bloqueios e conflitos ao criar ou alterar um agendamento.
- Excluir um procedimento o remove da operacao normal sem apagar atendimentos ou dados financeiros historicos.
- Aprovar uma acao de Inteligencia apenas a deixa pronta para execucao. Executar e uma etapa separada; nenhuma mensagem de WhatsApp e enviada automaticamente.
- Abrir `wa.me` e registrado como `whatsapp_opened`; isso nao confirma que a cliente recebeu ou leu a mensagem.

Para gerar mensagens com o Gemini, configure `GEMINI_API_KEY` no ambiente do servidor (em `.env.local` no desenvolvimento ou nas variaveis de ambiente do deploy). A chave deve permanecer somente no servidor e nao deve usar o prefixo `NEXT_PUBLIC_`. `GEMINI_MODEL` e opcional; se definido, use um identificador de modelo habilitado para essa chave na API Gemini. Sem `GEMINI_API_KEY`, a API devolve uma mensagem-padrao montada com os dados reais da cliente (nome e ultimo procedimento), a tela sinaliza que a IA esta indisponivel e o fluxo de revisao e abertura do `wa.me` continua funcionando.

## Integração com a WhatsApp Business Cloud API (Meta)

O endpoint público do webhook fica em `/api/communication/whatsapp/webhook`.

- **`GET` (verificação da Meta):** valida `hub.mode` e `hub.verify_token`; responde com `hub.challenge` como texto puro somente quando o token confere com `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Caso contrário responde `403`.
- **`POST` (notificações):** valida a assinatura `X-Hub-Signature-256` (HMAC-SHA256 do **corpo bruto** calculado com `WHATSAPP_APP_SECRET`). Assinatura ausente/invalida responde `401`; corpo nao-JSON responde `400`; sem `WHATSAPP_APP_SECRET` responde `503`. Quando tudo confere, a Meta recebe `200 {"received":true}`. Nesta etapa o endpoint **apenas recebe e valida** — nenhuma resposta automatica e enviada a clientes e nada e gravado no banco.

Variaveis de ambiente (somente no servidor; nunca use o prefixo `NEXT_PUBLIC_`):

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — token de verificacao que voce define e informa no painel da Meta.
- `WHATSAPP_APP_SECRET` — App Secret do aplicativo Meta, usado para validar a assinatura. Nunca e exposto ao cliente nem registrado em log.
- Credenciais do canal (lidas pelo mesmo modulo e usadas na tela `/app/comunicacao`): `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.

Passos que ainda dependem da configuracao no painel da Meta (fora do codigo):

1. Criar/escolher o App da Meta e o numero (de teste ou de producao).
2. Definir a Callback URL como `https://estetiqi.com.br/api/communication/whatsapp/webhook` e o Verify Token igual a `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
3. Assinar os campos desejados (ex.: `messages`) e concluir a verificacao do webhook.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Ajuda e suporte

- **Landing page:** contato publico no rodape com link `mailto:contato@estetiqi.com.br`.
- **No app:** a opcao "Ajuda e suporte", no menu de tres pontinhos (botao "Mais opcoes"), abre `/app/suporte`.
- **Formulario:** categoria, assunto e descricao. A solicitacao e validada no cliente e no servidor e so confirma sucesso depois de persistida.
- **Persistencia:** tabela `support_requests` (migration `026_support_requests.sql`), gravada com a organizacao e o usuario da sessao autenticada (Clerk). Cada usuario enxerga apenas as proprias solicitacoes; o isolamento entre organizacoes e preservado.
- **Notificacao do responsavel (opcional):** defina `SUPPORT_NOTIFICATION_WEBHOOK_URL` (ex.: um webhook do Activepieces, ja usado no projeto, Slack, Discord ou Zapier) para receber um `POST` JSON a cada nova solicitacao e reencaminha-la para `suporte@estetiqi.com.br`. Sem essa variavel, nada e enviado, a solicitacao continua salva e a interface nao afirma que um e-mail foi enviado. Nao ha provedor de e-mail/SMTP configurado no projeto.
- **Consulta pelo responsavel:** use a central administrativa em `/admin/suporte` (ver abaixo) ou `node scripts-list-support-requests.mjs` (usa `DATABASE_URL` do `.env.local`). Nao ha API publica: ver todas as organizacoes exige ser administrador da plataforma.
- **Central administrativa:** em `/admin/suporte` o responsavel pela EstetiQI ve as solicitacoes de todas as organizacoes clientes, abre a conversa completa, responde ao ticket e altera a situacao entre aberta, em andamento e resolvida. E acessada pelo menu "Mais opcoes" (atalho "Central de suporte (EstetiQi)"), que so aparece para quem esta autorizado.
- **Como autorizar o administrador:** defina a variavel de ambiente `SUPPORT_ADMIN_EMAILS` no servidor (variaveis de ambiente do deploy ou `.env.local`) com os e-mails da equipe separados por virgula, por exemplo `SUPPORT_ADMIN_EMAILS=fulano@estetiqi.com.br,beltrano@estetiqi.com.br`. Somente e-mails VERIFICADOS das contas Clerk entram na comparacao. Sem a variavel, ninguem e administrador (acesso negado por padrao) e o atalho nao aparece.
- **Conversa das solicitacoes:** as mensagens ficam em `support_messages` (migration `027_support_messages.sql`, incremental e idempotente: preserva os tickets existentes). A migration 027 **ja foi aplicada e verificada em producao**: a tabela `support_messages` e os tres indices existem e a versao esta registrada em `schema_migrations`. Ela foi aplicada pelo utilitario dedicado `scripts-apply-027.mjs`, que roda exclusivamente a 027 de forma transacional, recebe a `DATABASE_URL` de producao somente por variavel de ambiente, confere o fingerprint do host antes de qualquer escrita e oferece os modos `--dry-run` (ROLLBACK), `--apply` (COMMIT) e `--verify`. Nao rode `scripts-migrate.mjs` contra producao usando `.env.local`: `.env.local` aponta para o banco de DESENVOLVIMENTO, nao para producao.
- **Seguranca:** a cliente so consulta e responde aos proprios tickets, sempre dentro da organizacao e do usuario da sessao; as APIs administrativas validam a sessao no servidor e a allowlist de e-mails verificados. Nenhum `organization_id`, `user_id`, identidade de autor ou papel administrativo enviado pelo navegador e aceito como fonte de autorizacao.
