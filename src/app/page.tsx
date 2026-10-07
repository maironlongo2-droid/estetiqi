import Link from "next/link";

const centralized = [
  "Clientes",
  "Agenda",
  "Financeiro",
  "Procedimentos",
  "Oportunidades de retorno",
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
    icon: "◎",
    title: "Financeiro",
    text: "Registre pagamentos, inclusive divididos, e acompanhe os recebimentos por período.",
  },
  {
    icon: "✦",
    title: "Inteligência",
    text: "Aponta clientes que podem voltar e sugere a mensagem de retorno.",
  },
  {
    icon: "⟳",
    title: "Automações",
    text: "Listas de clientes sem retorno para consultar quando quiser. Nada é enviado sem você.",
  },
  {
    icon: "✂",
    title: "Profissionais e procedimentos",
    text: "Cadastre equipe, serviços, valores, duração e prazo de retorno de cada procedimento.",
  },
];

const differentials = [
  {
    title: "Pensado para a rotina de estética",
    text: "Procedimentos com prazo de retorno, atendimentos por profissional e clientes que costumam voltar em ciclos.",
  },
  {
    title: "Mais que uma agenda",
    text: "Além de organizar horários, mostra quem está sem voltar e o que fazer a respeito.",
  },
  {
    title: "Você decide cada contato",
    text: "O EstetiQI sugere e prepara a mensagem. Quem revisa e envia pelo WhatsApp é você.",
  },
];

const reactivationSteps = [
  "O EstetiQI identifica clientes que não voltam há um tempo.",
  "Mostra a oportunidade e sugere uma ação para cada cliente.",
  "Prepara uma mensagem para você revisar.",
  "Você abre o WhatsApp e envia com um toque.",
];

const start = [
  "Crie sua conta",
  "Cadastre seus procedimentos e clientes",
  "Organize a agenda e acompanhe seu negócio",
];

const primaryButton =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-[#527765] px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-[#527765]/15 transition hover:bg-[#456957]";
const secondaryButton =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-[#d7e1dc] bg-white px-7 py-3 text-sm font-semibold text-[#496458] transition hover:bg-[#f5faf7]";

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
            className="inline-flex min-h-11 items-center rounded-full bg-[#527765] whitespace-nowrap px-4 sm:px-5 text-sm font-semibold text-white transition hover:bg-[#456957]"
          >
            Começar agora
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24 lg:pt-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7a84]">
            Para profissionais de estética
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-[#263a32] sm:text-5xl lg:text-6xl">
            Seu negócio de estética organizado em um só lugar.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[#66756d]">
            Clientes, agenda e financeiro juntos, com uma inteligência que mostra
            quem pode voltar e ajuda você a chamar essas clientes pelo WhatsApp.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/cadastro" className={primaryButton}>
              Começar agora
            </Link>
            <Link href="/login" className={secondaryButton}>
              Entrar
            </Link>
          </div>
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

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:items-center lg:py-24">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9a7a84]">
            Relacionamento
          </p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-[#30463c]">
            Não deixe seus clientes esquecerem de você
          </h2>
          <p className="mt-4 max-w-lg leading-7 text-[#66756d]">
            Cliente que some quase sempre só precisa de um lembrete. O EstetiQI
            mostra quem é e já deixa a mensagem pronta.
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
      </section>

      <section className="bg-[#f1f6f3]">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-[#30463c]">
            Não é só uma agenda. É um apoio para o seu negócio.
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {differentials.map((item) => (
              <article key={item.title} className="rounded-3xl bg-white p-6">
                <h3 className="font-semibold text-[#30463c]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#78867f]">{item.text}</p>
              </article>
            ))}
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
          <Link href="/cadastro" className={`${primaryButton} mt-8`}>
            Começar agora
          </Link>
        </div>
      </section>

      <footer className="border-t border-[#e8eeea] px-5 py-8 text-center">
        <p className="text-xs tracking-wider text-[#8a9892]">
          EstetiQI · Gestão para profissionais de estética
        </p>
      </footer>
    </main>
  );
}
