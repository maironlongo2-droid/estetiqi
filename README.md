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
- **`POST` (notificacoes):** valida a assinatura `X-Hub-Signature-256` (HMAC-SHA256 do **corpo bruto** calculado com `WHATSAPP_APP_SECRET`). Assinatura ausente/invalida responde `401`; corpo nao-JSON responde `400`; sem `WHATSAPP_APP_SECRET` responde `503`; corpo acima de 1 MB responde `413`. Quando tudo confere, o endpoint **processa e grava as mensagens recebidas** de clientes na organizacao dona do numero que as recebeu e a Meta recebe `200 {"received":true}`. Falha real de banco responde `500` (nao confirmamos sucesso sem ter armazenado de fato). Respostas automaticas, chatbot e agendamento por conversa continuam fora do escopo.

Variaveis de ambiente (somente no servidor; nunca use o prefixo `NEXT_PUBLIC_`):

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` — token de verificacao que voce define e informa no painel da Meta.
- `WHATSAPP_APP_SECRET` — App Secret do aplicativo Meta, usado para validar a assinatura. Nunca e exposto ao cliente nem registrado em log.
- Credenciais do canal (lidas pelo mesmo modulo e usadas na tela `/app/comunicacao`): `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`.

Passos que ainda dependem da configuracao no painel da Meta (fora do codigo):

1. Criar/escolher o App da Meta e o numero (de teste ou de producao).
2. Definir a Callback URL como `https://estetiqi.com.br/api/communication/whatsapp/webhook` e o Verify Token igual a `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
3. Assinar os campos desejados (ex.: `messages`) e concluir a verificacao do webhook.

### Mensagens recebidas (inbound)

- **Como a empresa e identificada:** pelo `metadata.phone_number_id` do evento, cruzado com a tabela `whatsapp_integrations` (coluna `phone_number_id`). O `organization_id` nunca vem do corpo da requisicao; sem um numero associado a exatamente uma integracao, o evento nao e ligado a empresa nenhuma.
- **Idempotencia:** o `id` da mensagem (`provider_message_id`) e unico por organizacao (indice `uq_communication_messages_provider_id`, migration 033). Reentregas da Meta nao criam duplicata (`INSERT ... ON CONFLICT DO NOTHING`).
- **O que e gravado** em `communication_messages`: organizacao, cliente (somente quando o telefone confere com um unico cliente da mesma empresa), `channel = 'whatsapp'`, `direction = 'inbound'`, `category = 'atendimento'`, `status = 'received'`, `provider_message_id`, `message_type`, `body` (texto ou legenda de midia; `null` para tipos sem texto), `event_at` (data/hora do evento), `whatsapp_phone_number_id`, `sender_phone` e `metadata` (JSON, ex.: id da mensagem citada). Atualizacoes de **status** de mensagens enviadas (`statuses`) sao ignoradas nesta etapa.
- **Migrations exigidas:** `033_communication_messages.sql`, `035_whatsapp_integrations.sql` e `036_inbound_whatsapp_messages.sql` precisam estar aplicadas, e o numero deve estar cadastrado em `whatsapp_integrations`. Enquanto isso nao ocorrer, todo evento valido responde `500` (comportamento esperado: a Meta reentrega).

### Conexao oficial, credenciais e envio (Embedded Signup)

- **Como a empresa e identificada no envio:** as credenciais sao lidas a partir da organizacao do USUARIO AUTENTICADO (nunca de um `organization_id` enviado pelo cliente) e decifradas apenas no servidor.
- **Conectar o numero (por organizacao):** a aba `Conversas` > `WhatsApp e configuracoes` abre o Embedded Signup oficial da Meta (Facebook Login for Business com `config_id`). O navegador devolve o `code` e envia `POST /api/communication/whatsapp/connect`. O servidor: (1) troca o `code` por token; (2) estende para longa duracao; (3) confirma que o token realmente LE o `phone_number_id` informado; (4) grava a integracao da organizacao. Exige permissao de dono (`organization:update`) e limite de 10 tentativas por minuto.
- **Credenciais protegidas:** o token e gravado CIFRADO (AES-256-GCM) em `whatsapp_integrations.access_token_encrypted` (migration 037) e nunca e devolvido por nenhuma resposta. A chave vem de `WHATSAPP_CREDENTIALS_KEY`; sem ela a conexao responde `KEY_MISSING` e nada e gravado em texto puro.
- **Envio de texto:** `POST /api/communication/whatsapp/send` (`to`, `body`, `clientId` opcional). Exige permissao de edicao de clientes, limite de 60 envios por minuto por organizacao/IP. O sistema so afirma envio quando a Meta aceita (`providerMessageId`); o registro no historico e informado separadamente em `recorded`.
- **Regras da Meta:** somente a API oficial (nada de automacao por WhatsApp Web). Texto livre e aceito apenas dentro da janela de 24h da ultima mensagem da cliente; fora dela e necessario um MODELO aprovado. Nao enviamos promocao sem consentimento.
- **Caixa de entrada:** `GET /api/communication/whatsapp/conversations` lista as conversas recebidas; `GET /api/communication/whatsapp/conversations/messages?phone=...` reune recebidas e enviadas (as enviadas sao casadas pelo cliente vinculado ou pelo destino gravado em `metadata.to`). A resposta da conversa e o envio de texto livre ficam na propria aba `Conversas`.
- **Migrations exigidas para conectar/enviar:** `033`, `035`, `036` e `037`. Sem elas, conectar responde `SCHEMA_PENDING` (503) e a interface explica exatamente o que falta, em vez de mostrar sucesso falso.
- **Variaveis de ambiente do fluxo oficial:** `WHATSAPP_APP_ID`, `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` e `WHATSAPP_CREDENTIALS_KEY` (alem de `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_CLOUD_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` e `WHATSAPP_BUSINESS_ACCOUNT_ID`).

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
