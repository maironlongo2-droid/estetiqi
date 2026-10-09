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
