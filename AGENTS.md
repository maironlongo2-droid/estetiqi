# ESTETIQI — REGRAS DO AGENTE

## OBJETIVO

O EstetiQI é um SaaS para profissionais de estética.

O objetivo do MVP não é possuir muitas funcionalidades.

O objetivo é provar que uma profissional consegue usar o sistema para:

1. organizar clientes;
2. organizar procedimentos;
3. organizar agenda;
4. registrar pagamentos;
5. visualizar seu financeiro;
6. identificar clientes que podem retornar;
7. receber uma sugestão de ação;
8. gerar uma mensagem;
9. abrir o WhatsApp;
10. transformar organização + reativação em oportunidade de faturamento.

O fluxo principal é:

LOGIN
→ DASHBOARD
→ CLIENTES
→ PROCEDIMENTOS
→ AGENDA
→ PAGAMENTO
→ FINANCEIRO
→ IA
→ OPORTUNIDADE
→ MENSAGEM
→ WHATSAPP

---

## PRINCÍPIO FUNDAMENTAL

Não otimizar o projeto simplesmente para fazer os testes passarem.

O produto precisa funcionar para uma pessoa real.

Nunca alterar um teste apenas para esconder uma falha real do produto.

---

## PRIORIDADES

P0 — Segurança e perda/vazamento de dados.

P1 — Fluxo principal quebrado.

P2 — UX que impede ou dificulta muito o uso.

P3 — Melhorias visuais e cosméticas.

Sempre resolver P0 antes de P1, P1 antes de P2 e P2 antes de P3.

---

## ESCOPO DO MVP

O MVP deve concentrar-se em:

* autenticação;
* onboarding;
* dashboard;
* clientes;
* procedimentos;
* agenda;
* financeiro simples;
* IA de oportunidades;
* clientes inativos;
* ações;
* mensagens de reativação;
* WhatsApp via wa.me.

Não adicionar neste momento:

* marketplace completo;
* Open Finance;
* pagamentos online completos;
* rede social;
* automações complexas;
* funcionalidades enterprise;
* funcionalidades que não contribuam para validar o produto.

---

## SEGURANÇA

Nunca remover ou enfraquecer:

* Clerk;
* requireCurrentUser;
* hasPermission;
* RBAC;
* organization_id;
* isolamento multi-tenant;
* foreign keys de integridade de tenant;
* validações de autorização.

Nenhuma API deve confiar em organization_id enviado pelo cliente.

A organização deve ser obtida do usuário autenticado.

Usuários de organizações diferentes nunca podem acessar dados uns dos outros.

Respostas esperadas:

401 = não autenticado.

403 = autenticado, mas sem permissão.

404 = recurso não encontrado ou não pertence à organização quando apropriado.

500 = erro inesperado real.

Não transformar erros previsíveis de autorização em 500.

---

## AUTENTICAÇÃO

A sessão persistente do Clerk é comportamento normal.

Não forçar login novamente simplesmente porque o servidor foi reiniciado.

O comportamento correto é:

usuário autenticado
→ pode acessar /app.

usuário não autenticado
→ deve ser direcionado para login.

Deve existir logout funcional.

Depois do logout, o usuário não deve conseguir acessar páginas protegidas.

Não armazenar credenciais manualmente.

---

## EXPERIÊNCIA DO USUÁRIO

O sistema deve parecer um produto SaaS coerente.

Priorizar:

* navegação clara;
* títulos claros;
* botões compreensíveis;
* feedback de sucesso;
* feedback de erro;
* loading;
* estados vazios;
* confirmações de ações destrutivas;
* responsividade;
* textos claros em português;
* consistência entre telas.

Não fazer redesign gigantesco.

Corrigir o que realmente prejudica a utilização.

---

## VALOR ECONÔMICO

Toda funcionalidade relacionada à IA deve responder:

"Isso ajuda a profissional a tomar uma ação que pode gerar ou recuperar faturamento?"

O produto deve mostrar claramente:

DADOS
→ INSIGHT
→ OPORTUNIDADE
→ AÇÃO
→ MENSAGEM
→ WHATSAPP

Evitar dashboards que apenas exibem números sem indicar o que fazer.

Não inventar resultados financeiros.

---

## IA

A IA do MVP não precisa ser sofisticada.

É preferível:

* regra simples;
* dados reais;
* oportunidade clara;
* mensagem útil;
* ação executável;

do que uma IA complexa sem utilidade prática.

---

## BANCO

Preservar as migrations existentes.

Preservar as constraints de tenant.

Não apagar dados.

Não modificar banco de forma destrutiva.

---

## TESTES

Os testes devem validar comportamento real.

Antes de alterar um teste:

1. confirmar se o produto está correto;
2. confirmar se o seletor realmente está errado;
3. somente então alterar o teste.

Após mudanças relevantes:

npm run diagnose

Depois:

npm run test:e2e

Se um teste falhar:

1. identificar a causa;
2. corrigir a causa;
3. executar novamente.

Não mascarar erros.

---

## COMANDOS PROIBIDOS

Nunca executar:

git reset --hard

git clean -fd

ou qualquer comando destinado a apagar indiscriminadamente alterações existentes.

Preservar trabalho já realizado.

---

## ESTILO DE DESENVOLVIMENTO

Preferir:

* mudanças pequenas;
* código simples;
* reutilização do que já existe;
* poucas dependências;
* arquitetura atual;
* correções objetivas.

Evitar:

* refatorações gigantes;
* abstrações desnecessárias;
* dependências sem necessidade;
* duplicação;
* código temporário;
* funcionalidades fora do MVP.

---

## CRITÉRIO DE MVP PRONTO

O MVP está pronto para beta quando uma nova profissional consegue:

1. entrar;
2. entender o dashboard;
3. cadastrar cliente;
4. cadastrar procedimento;
5. criar agendamento;
6. registrar pagamento;
7. visualizar o financeiro;
8. encontrar uma oportunidade;
9. gerar uma mensagem;
10. abrir o WhatsApp;

sem encontrar bloqueios importantes.

Além disso:

* segurança funcionando;
* tenant isolation funcionando;
* RBAC funcionando;
* build funcionando;
* TypeScript funcionando;
* fluxo principal E2E funcionando.

---

## REGRA FINAL

Não confundir "software tecnicamente grande" com "produto validado".

Neste momento:

FUNCIONAMENTO > SEGURANÇA > VALOR PARA O USUÁRIO > UX > ESTÉTICA > FUNCIONALIDADES EXTRAS.

O objetivo é colocar o EstetiQI nas mãos de 3–5 usuários reais e descobrir se ele realmente gera valor.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
