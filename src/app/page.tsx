"use client";

import Link from "next/link";
import { useState } from "react";

const centralized = [
  "Clientes",
  "Agenda",
  "Procedimentos",
  "Financeiro",
  "Oportunidades de retorno",
];

const benefits = [
  {
    icon: "◷",
    title: "Organize a agenda",
    text: "Agendamentos por profissional e procedimento, sem conflito de horários.",
  },
  {
    icon: "♡",
    title: "Centralize os clientes",
    text: "Cadastro com histórico de atendimentos e dados de contato sempre à mão.",
  },
  {
    icon: "◎",
    title: "Controle o financeiro",
    text: "Registre pagamentos e acompanhe quanto entrou no período.",
  },
  {
    icon: "✦",
    title: "Recupere clientes",
    text: "Veja quem está sem voltar e o que fazer para trazer essa cliente de volta.",
  },
];

const features = [
  {
    icon: "♡",
    title: "Clientes",
    text: "Cadastro, histórico de atendimentos e contato direto pelo WhatsApp.",
  },
  {
    icon: "◷",
    title: "Agenda",
    text: "Agendamentos por profissional e procedimento, com horários livres e sem conflito.",
  },
  {
    icon: "✂",
    title: "Procedimentos",
    text: "Serviços com valor, duração e prazo de retorno definidos por você.",
  },
  {
    icon: "◎",
    title: "Financeiro",
    text: "Registre pagamentos, inclusive divididos, e acompanhe os recebimentos por período.",
  },
  {
    icon: "✦",
    title: "Assistente IA (Gemini)",
    text: "Aponta clientes que podem voltar e prepara a mensagem de retorno para você revisar.",
  },
  {
    icon: "⟳",
    title: "Profissionais",
    text: "Cadastre a equipe e acompanhe a agenda e o histórico de cada profissional.",
  },
];

const reactivationSteps = [
  "O EstetiQI identifica clientes que não voltam há um tempo.",
  "Mostra a oportunidade e sugere uma ação para cada cliente.",
  "Prepara uma mensagem para você revisar.",
  "Você abre o WhatsApp e envia com um toque.",
];

const trustPoints = [
  {
    title: "Você no controle",
    text: "A IA sugere e prepara o texto, mas nada é enviado automaticamente. Quem revisa e envia pelo WhatsApp é você.",
  },
  {
    title: "Baseado nos seus atendimentos",
    text: "As oportunidades usam o histórico real da sua agenda e dos seus clientes, sem números inventados.",
  },
  {
    title: "Acesso seguro",
    text: "Login com autenticação e dados separados por organização.",
  },
];

const start = [
  "Crie sua conta",
  "Cadastre seus procedimentos e clientes",
  "Organize a agenda e acompanhe seu negócio",
];

const statusStyles: Record<string, string> = {
  Concluído: "bg-[#e3f0e8] text-[#527765]",
  Confirmado: "bg-[#e3f0e8] text-[#527765]",
  Aguardando: "bg-[#f4e4e8] text-[#a87483]",
  Disponível: "bg-[#eef1f0] text-[#6d7d75]",
};

const demoAgenda = [
  {
    id: "09:00",
    time: "09:00",
    client: "Ana Souza",
    procedure: "Limpeza de pele",
    status: "Concluído",
    detail: "Atendimento realizado. Retorno sugerido para daqui a 30 dias.",
  },
  {
    id: "11:00",
    time: "11:00",
    client: "Bianca Lima",
    procedure: "Design de sobrancelhas",
    status: "Confirmado",
    detail: "Cliente confirmou presença pelo WhatsApp.",
  },
  {
    id: "14:30",
    time: "14:30",
    client: "Carla Nunes",
    procedure: "Massagem relaxante",
    status: "Aguardando",
    detail: "Horário ainda não confirmado pela cliente.",
  },
  {
    id: "16:00",
    time: "16:00",
    client: "Horário livre",
    procedure: "Disponível para encaixe",
    status: "Disponível",
    detail: "Nenhum atendimento marcado neste horário.",
  },
];

const demoInactiveClient = {
  name: "Priscila Moreira",
  procedure: "Aplicação de cílios",
  daysAgo: 78,
  suggestion:
    "Oi, Priscila! Tudo bem? Notei que já faz um tempinho desde a sua aplicação de cílios. Quer que eu veja um horário para a sua manutenção esta semana?",
};

const demoFinanceTabs = ["Hoje", "Esta semana", "Este mês"] as const;
type DemoFinanceTab = (typeof demoFinanceTabs)[number];

const demoFinance: Record<DemoFinanceTab, { label: string; value: string }[]> = {
  Hoje: [
    { label: "Atendimentos", value: "3" },
    { label: "Faturamento", value: "R$ 460" },
    { label: "Ticket médio", value: "R$ 153" },
  ],
  "Esta semana": [
    { label: "Atendimentos", value: "11" },
    { label: "Faturamento", value: "R$ 1.690" },
    { label: "Ticket médio", value: "R$ 154" },
  ],
  "Este mês": [
    { label: "Atendimentos", value: "42" },
    { label: "Faturamento", value: "R$ 6.480" },
    { label: "Ticket médio", value: "R$ 154" },
  ],
};

const primaryButton =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-[#527765] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-[#527765]/15 transition hover:bg-[#456957]";
const secondaryButton =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-[#d7e1dc] bg-white px-7 py-3 text-sm font-semibold text-[#496458] transition hover:bg-[#f5faf7]";

function AgendaPreview() {
  const [selected, setSelected] = useState(demoAgenda[0].id);
  const active =
    demoAgenda.find((item) => item.id === selected) ?? demoAgenda[0];

  return (
    <div className="flex h-full flex-col rounded-3xl border border-[#e2ebe5] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-[#30463c]">Agenda de hoje</h3>
        <span className="rounded-full bg-[#f4e4e8] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#a87483]">
          Exemplo
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#84928c]">
        Toque em um horário para ver os detalhes.
      </p>

      <ul className="mt-4 space-y-2">
        {demoAgenda.map((item) => {
          const isActive = item.id === selected;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setSelected(item.id)}
                aria-pressed={isActive}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                  isActive
                    ? "border-[#527765] bg-[#f5faf7]"
                    : "border-[#e6ece8] bg-white hover:bg-[#f7faf8]"
                }`}
              >
                <span className="w-11 shrink-0 text-sm font-semibold text-[#527765]">
                  {item.time}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[#30463c]">
                    {item.client}
                  </span>
                  <span className="block truncate text-xs text-[#84928c]">
                    {item.procedure}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    statusStyles[item.status] ?? "bg-[#eef1f0] text-[#6d7d75]"
                  }`}
                >
                  {item.status}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 rounded-2xl bg-[#f7faf8] p-4 text-sm leading-6">
        <p className="font-medium text-[#30463c]">
          {active.time} · {active.client}
        </p>
        <p className="mt-1 text-[#6d7d75]">{active.detail}</p>
      </div>
    </div>
  );
}

function AiPreview() {
  const [revealed, setRevealed] = useState(false);
  const [message, setMessage] = useState(demoInactiveClient.suggestion);

  return (
    <div className="flex h-full flex-col rounded-3xl border border-[#e2ebe5] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-[#30463c]">Oportunidade de retorno</h3>
        <span className="rounded-full bg-[#f4e4e8] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#a87483]">
          Exemplo
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-[#e6ece8] bg-[#f7faf8] p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-[#30463c]">
              {demoInactiveClient.name}
            </p>
            <p className="text-xs text-[#84928c]">
              {demoInactiveClient.procedure} · último atendimento há{" "}
              {demoInactiveClient.daysAgo} dias
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#f4e4e8] px-3 py-1 text-xs font-medium text-[#a87483]">
            Pode voltar
          </span>
        </div>
      </div>

      {revealed ? (
        <div className="mt-4">
          <label
            htmlFor="demo-ai-message"
            className="text-xs font-medium text-[#6d7d75]"
          >
            Sugestão de mensagem (editável)
          </label>
          <textarea
            id="demo-ai-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            className="mt-2 w-full resize-none rounded-2xl border border-[#dfe9e3] bg-[#f7faf8] p-3 text-sm leading-6 text-[#52645b] outline-none focus:border-[#527765]"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-[#527765] px-5 text-sm font-semibold text-white transition hover:bg-[#456957]"
        >
          Ver sugestão de mensagem
        </button>
      )}

      <p className="mt-auto pt-3 text-xs leading-5 text-[#84928c]">
        Exemplo ilustrativo. Nenhuma mensagem é enviada e nenhum contato é
        aberto automaticamente.
      </p>
    </div>
  );
}

function FinancePreview() {
  const [tab, setTab] = useState<DemoFinanceTab>("Hoje");
  const indicators = demoFinance[tab];

  return (
    <div className="flex h-full flex-col rounded-3xl border border-[#e2ebe5] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-[#30463c]">Financeiro</h3>
        <span className="rounded-full bg-[#f4e4e8] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#a87483]">
          Exemplo
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        {demoFinanceTabs.map((item) => {
          const isActive = item === tab;
          return (
            <button
              key={item}
              type="button"
              aria-pressed={isActive}
              onClick={() => setTab(item)}
              className={`inline-flex min-h-10 flex-1 items-center justify-center rounded-full px-3 text-xs font-medium transition ${
                isActive
                  ? "bg-[#527765] text-white"
                  : "bg-[#f0f5f2] text-[#496458] hover:bg-[#e6efea]"
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>

      <dl className="mt-4 grid gap-3">
        {indicators.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-2xl bg-[#f7faf8] px-4 py-3"
          >
            <dt className="text-sm text-[#6d7d75]">{item.label}</dt>
            <dd className="text-lg font-semibold text-[#30463c]">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-auto pt-3 text-xs leading-5 text-[#84928c]">
        Valores fictícios para demonstração. Nada é lido do seu financeiro real.
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#fbfaf8] text-[#26352f]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-5 sm:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="EstetiQI">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#dceee4] text-lg text-[#527765]">
            ✦
          </span>
          <span className="text-xl font-semibold tracking-[0.12em] text-[#30463c]">
            Esteti<span className="text-[#7a9f8d]">Qi</span>
          </span>
        </Link>

        <nav aria-label="Acesso" className="flex items-center gap-2">
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-[#496458] transition hover:bg-[#f0f5f2]"
          >
            Entrar
          </Link>
          <Link
            href="/cadastro"
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full bg-[#527765] px-4 text-sm font-semibold text-white transition hover:bg-[#456957] sm:px-5"
          >
            Começar agora
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7a84]">
            Plataforma inteligente para profissionais de estética
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-[#263a32] sm:text-5xl lg:text-6xl">
            Seu negócio de estética organizado em um só lugar.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#66756d]">
            Clientes, agenda, procedimentos e financeiro juntos, com uma
            inteligência que mostra quem pode voltar e prepara a mensagem para
            você chamar pelo WhatsApp.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/cadastro" className={primaryButton}>
              Começar agora
            </Link>
            <Link href="/login" className={secondaryButton}>
              Entrar
            </Link>
          </div>
          <a
            href="#previa"
            className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[#496458] transition hover:text-[#30463c]"
          >
            Ver a demonstração interativa
            <span aria-hidden="true">↓</span>
          </a>
        </div>

        <div
          aria-label="Exemplo ilustrativo de oportunidade de retorno"
          className="rounded-[2rem] border border-[#dfe9e3] bg-white p-4 shadow-[0_25px_80px_rgba(64,91,78,0.10)] sm:p-5"
        >
          <div className="rounded-[1.5rem] bg-[#f5faf7] p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#9a7a84]">
              Exemplo ilustrativo
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[#30463c]">
              Oportunidade de retorno
            </h2>

            <div className="mt-4 rounded-2xl border border-[#e1ebe5] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-[#30463c]">Ana Souza</p>
                  <p className="text-xs text-[#84928c]">
                    Limpeza de pele · último atendimento há 62 dias
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#f4e4e8] px-3 py-1 text-xs font-medium text-[#a87483]">
                  Pode voltar
                </span>
              </div>

              <div className="mt-4 rounded-xl bg-[#f7faf8] p-3 text-sm leading-6 text-[#52645b]">
                “Oi, Ana! Já faz um tempinho desde a sua limpeza de pele. Quer
                que eu veja um horário para você esta semana?”
              </div>

              <div className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[#527765] px-5 text-sm font-semibold text-white">
                Abrir WhatsApp
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#e8eeea] bg-white/70">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-[#30463c]">
              Chega de anotar tudo em caderno, planilha e conversa de WhatsApp.
            </h2>
            <p className="mt-4 max-w-lg leading-7 text-[#66756d]">
              Quando a rotina está espalhada, fica difícil saber quem atender,
              quanto entrou e quais clientes pararam de voltar. No EstetiQI
              tudo isso fica junto:
            </p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {centralized.map((item) => (
              <li
                key={item}
                className="rounded-full border border-[#dfe9e3] bg-white px-4 py-2 text-sm font-medium text-[#52645b]"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="beneficios" className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-[#30463c]">
          O que o EstetiQI resolve no seu dia
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {benefits.map((item) => (
            <article
              key={item.title}
              className="rounded-3xl border border-[#e2ebe5] bg-white p-6"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e4f1e9] text-lg text-[#668978]">
                {item.icon}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-[#30463c]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#78867f]">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="recursos" className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-[#30463c]">
          Feito para a rotina da sua estética
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((item) => (
            <article
              key={item.title}
              className="rounded-3xl border border-[#e2ebe5] bg-white p-6"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e4f1e9] text-lg text-[#668978]">
                {item.icon}
              </span>
              <h3 className="mt-5 text-lg font-semibold text-[#30463c]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#78867f]">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="previa"
        className="scroll-mt-20 border-y border-[#e8eeea] bg-white/70"
      >
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7a84]">
            Prévia interativa
          </p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-[#30463c]">
            Experimente um pouco do EstetiQI agora
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-[#66756d]">
            Uma demonstração leve, com dados fictícios, do que existe dentro da
            plataforma. Nada é salvo e nenhuma operação real acontece por aqui.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            <AgendaPreview />
            <AiPreview />
            <FinancePreview />
          </div>

          <p className="mt-6 text-xs leading-5 text-[#8a9892]">
            Demonstração ilustrativa. Para usar com os seus próprios dados, crie
            sua conta.
          </p>
        </div>
      </section>

      <section className="bg-[#f1f6f3]">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7a84]">
              Inteligência e relacionamento
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-[#30463c]">
              A IA aponta a oportunidade. A mensagem, você decide.
            </h2>
            <p className="mt-4 max-w-lg leading-7 text-[#66756d]">
              A partir do histórico real de atendimentos, o EstetiQI mostra
              clientes que podem voltar e prepara uma mensagem personalizada
              para você revisar e enviar pelo seu WhatsApp.
            </p>
            <p className="mt-4 max-w-lg rounded-2xl bg-white p-4 text-sm font-medium leading-6 text-[#52645b]">
              O EstetiQI não envia mensagens automaticamente. Você revisa o
              texto e abre a conversa no WhatsApp quando quiser.
            </p>
          </div>

          <ol className="space-y-3">
            {reactivationSteps.map((step, index) => (
              <li
                key={step}
                className="flex items-center gap-4 rounded-2xl border border-[#e2ebe5] bg-white p-4"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e3f0e8] text-sm font-semibold text-[#648676]">
                  {index + 1}
                </span>
                <span className="text-sm font-medium leading-6 text-[#52645b]">
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-[#30463c]">
          Feito com transparência
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {trustPoints.map((item) => (
            <article key={item.title} className="rounded-3xl bg-[#f1f6f3] p-6">
              <h3 className="font-semibold text-[#30463c]">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#6d7d75]">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-[#e8eeea] bg-white/70">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7a84]">
              Fase de validação
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-[#30463c]">
              O EstetiQI está em fase de validação inicial.
            </h2>
            <p className="mt-4 max-w-lg leading-7 text-[#66756d]">
              Estamos evoluindo a plataforma com o uso real de profissionais de
              estética. Você pode criar sua conta e conhecer o sistema.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
            <Link href="/cadastro" className={primaryButton}>
              Começar agora
            </Link>
            <Link href="/login" className={secondaryButton}>
              Entrar
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
        <h2 className="text-3xl font-semibold tracking-tight text-[#30463c]">
          Simples para começar
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {start.map((step, index) => (
            <li
              key={step}
              className="rounded-3xl border border-[#e2ebe5] bg-white p-6"
            >
              <span className="text-2xl font-semibold text-[#9a7a84]">
                {index + 1}
              </span>
              <p className="mt-3 font-medium leading-6 text-[#30463c]">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <div className="rounded-[2rem] bg-[#dfeee6] px-6 py-12 text-center sm:px-12">
          <h2 className="mx-auto max-w-xl text-3xl font-semibold leading-tight text-[#30463c]">
            Comece a organizar sua estética hoje.
          </h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/cadastro" className={primaryButton}>
              Começar agora
            </Link>
            <Link href="/login" className={secondaryButton}>
              Entrar
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e8eeea] px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="EstetiQI">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#dceee4] text-[#527765]">
              ✦
            </span>
            <span className="text-sm font-semibold tracking-[0.12em] text-[#30463c]">
              Esteti<span className="text-[#7a9f8d]">Qi</span>
            </span>
          </Link>

          <nav
            aria-label="Navegação do rodapé"
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
          >
            <a
              href="#recursos"
              className="text-sm text-[#6d7d75] transition hover:text-[#30463c]"
            >
              Recursos
            </a>
            <a
              href="#beneficios"
              className="text-sm text-[#6d7d75] transition hover:text-[#30463c]"
            >
              Benefícios
            </a>
            <Link
              href="/cadastro"
              className="text-sm font-medium text-[#496458] transition hover:text-[#30463c]"
            >
              Começar agora
            </Link>
            <Link
              href="/login"
              className="text-sm text-[#6d7d75] transition hover:text-[#30463c]"
            >
              Entrar
            </Link>
          </nav>
        </div>

        <p className="mx-auto mt-8 max-w-6xl text-center text-xs tracking-wider text-[#8a9892]">
          EstetiQI · Gestão para profissionais de estética
        </p>
      </footer>
    </main>
  );
}
