const features = [
  {
    icon: "✦",
    title: "Inteligência que entende seu negócio",
    description:
      "O EstetiQi transforma os dados da sua operação em oportunidades reais de crescimento.",
  },
  {
    icon: "♡",
    title: "Relacionamento inteligente",
    description:
      "Identifique clientes que estão prontos para retornar, comprar novamente ou receber uma nova oferta.",
  },
  {
    icon: "⌁",
    title: "Automação sem complicação",
    description:
      "Conecte WhatsApp, Instagram e outros canais para automatizar tarefas e ganhar tempo.",
  },
];

const insights = [
  "Clientes próximos do próximo ciclo",
  "Oportunidades de reativação",
  "Horários disponíveis na agenda",
  "Clientes de alto valor em risco",
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfaf8] text-[#26352f]">
      {/* Background decorations */}
      <div className="pointer-events-none absolute left-0 top-0 h-96 w-96 rounded-full bg-[#dceee4] opacity-50 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-40 h-80 w-80 rounded-full bg-[#f5dfe4] opacity-40 blur-3xl" />

      {/* Navigation */}
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-7 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#dceee4] text-xl text-[#527765] shadow-sm">
            ✦
          </div>

          <div>
            <div className="text-2xl font-semibold tracking-[0.14em] text-[#30463c]">
              Esteti<span className="text-[#7a9f8d]">Qi</span>
            </div>

            <div className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.2em] text-[#91a39b]">
              
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-8 text-sm text-[#687870] md:flex">
          <a href="#recursos" className="transition hover:text-[#527765]">
            Recursos
          </a>

          <a href="#inteligencia" className="transition hover:text-[#527765]">
            Inteligência
          </a>

          <a href="#automacao" className="transition hover:text-[#527765]">
            Automação
          </a>
        </div>

        <a
          href="/login"
          className="rounded-full border border-[#d7e1dc] bg-white px-5 py-2.5 text-sm font-medium text-[#496458] shadow-sm transition hover:bg-[#f5faf7]"
        >
          Entrar
        </a>
      </nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-20 pt-12 lg:px-10 lg:pb-28 lg:pt-20">
        <div className="grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#dce8e1] bg-white/80 px-4 py-2 text-xs font-medium text-[#678075] shadow-sm backdrop-blur">
              <span className="text-[#b88996]">✦</span>
              
            </div>

            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.04em] text-[#263a32] sm:text-6xl lg:text-7xl">
              Seu negócio de beleza,
              <span className="block text-[#719582]">
                mais inteligente.
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-lg leading-8 text-[#718078]">
              O EstetiQi reúne seus clientes, agenda, relacionamento e
              automações em um só lugar — e usa inteligência artificial para
              encontrar oportunidades que você poderia deixar passar.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="/cadastro" className="rounded-full bg-[#527765] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#527765]/15 transition hover:-translate-y-0.5 hover:bg-[#456957]">
                Começar agora
              </a>

              <a href="#recursos" className="rounded-full border border-[#d7e1dc] bg-white px-7 py-3.5 text-sm font-semibold text-[#527765] transition hover:bg-[#f5faf7]">
                Conhecer a plataforma
              </a>
            </div>

            <div className="mt-8 flex items-center gap-3 text-xs text-[#84928c]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e5f2eb] text-[#628474]">
                ✓
              </span>
              Feito para negócios que querem crescer com inteligência.
            </div>
          </div>

          {/* Intelligence preview */}
          <div id="inteligencia" className="relative">
            <div className="absolute -right-5 -top-8 text-5xl text-[#d7aab6] opacity-40">
              ✦
            </div>

            <div className="rounded-[2rem] border border-[#dfe9e3] bg-white/90 p-5 shadow-[0_25px_80px_rgba(64,91,78,0.12)] backdrop-blur">
              <div className="rounded-[1.5rem] bg-[#f5faf7] p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-[#8a9992]">
                      Visão do negócio
                    </p>
                    <h2 className="mt-1 text-xl font-semibold text-[#30463c]">
                      Bom dia, sua operação ✦
                    </h2>
                  </div>

                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#7a9f8d] shadow-sm">
                    ♡
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Metric
                    label="Oportunidades"
                    value="23"
                    detail="clientes identificados"
                  />

                  <Metric
                    label="Reativação"
                    value="47"
                    detail="clientes recuperáveis"
                  />

                  <Metric
                    label="Agenda"
                    value="3"
                    detail="horários disponíveis"
                  />

                  <Metric
                    label="Atenção"
                    value="7"
                    detail="clientes de alto valor"
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-[#e1ebe5] bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4e4e8] text-[#a87483]">
                      ✦
                    </div>

                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#a87483]">
                        Insight da IA
                      </p>

                      <p className="mt-1 text-sm leading-6 text-[#64736c]">
                        12 clientes estão próximos do ciclo de retorno.
                        Uma campanha de reativação pode ser criada agora.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute -bottom-6 -left-6 hidden rounded-2xl border border-[#e3ebe6] bg-white px-5 py-4 shadow-xl sm:block">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e5f2eb] text-[#628474]">
                  ✓
                </div>

                <div>
                  <p className="text-xs text-[#8b9892]">Receita potencial</p>
                  <p className="font-semibold text-[#30463c]">
                    Detectada pela IA
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section
        id="recursos"
        className="relative z-10 border-y border-[#e8eeea] bg-white/60"
      >
        <div className="mx-auto max-w-7xl px-6 py-20 lg:px-10">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[#9a7a84]">
              Mais que gestão
            </span>

            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#30463c] sm:text-4xl">
              Uma inteligência trabalhando junto com você.
            </h2>

            <p className="mt-4 leading-7 text-[#77857e]">
              O EstetiQi conecta seus dados para transformar informação em
              ação.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-[1.75rem] border border-[#e2ebe5] bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e4f1e9] text-xl text-[#668978]">
                  {feature.icon}
                </div>

                <h3 className="mt-6 text-lg font-semibold text-[#30463c]">
                  {feature.title}
                </h3>

                <p className="mt-3 text-sm leading-7 text-[#78867f]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI section */}
      <section
        id="automacao"
        className="relative z-10 mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-28"
      >
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[#9a7a84]">
              Oportunidades
            </span>

            <h2 className="mt-4 text-3xl font-semibold leading-tight text-[#30463c] sm:text-4xl">
              Pare de procurar oportunidades.
              <span className="block text-[#719582]">
                Deixe o EstetiQi encontrá-las.
              </span>
            </h2>

            <p className="mt-5 max-w-xl leading-7 text-[#77857e]">
              O sistema analisa seus clientes, procedimentos, agenda e
              histórico para mostrar o que merece sua atenção.
            </p>
          </div>

          <div className="rounded-[2rem] border border-[#e0e9e3] bg-white p-7 shadow-[0_20px_60px_rgba(64,91,78,0.08)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9a7a84]">
              Hoje o EstetiQi encontrou
            </p>

            <div className="mt-5 space-y-3">
              {insights.map((insight, index) => (
                <div
                  key={insight}
                  className="flex items-center gap-4 rounded-2xl bg-[#f7faf8] p-4"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e3f0e8] text-sm text-[#648676]">
                    {index + 1}
                  </span>

                  <span className="text-sm font-medium text-[#52645b]">
                    {insight}
                  </span>

                  <span className="ml-auto text-[#9aada3]">›</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-16 lg:px-10">
        <div className="overflow-hidden rounded-[2rem] bg-[#dfeee6] px-7 py-14 text-center sm:px-12">
          <div className="mx-auto max-w-2xl">
            <div className="text-3xl text-[#9a7a84]">✦</div>

            <h2 className="mt-3 text-3xl font-semibold text-[#30463c]">
              Seu negócio já tem os dados.
              <span className="block text-[#668978]">
                Agora transforme-os em crescimento.
              </span>
            </h2>

            <button className="mt-8 rounded-full bg-[#527765] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#527765]/20 transition hover:bg-[#456957]">
              Conhecer o EstetiQi
            </button>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[#e8eeea] px-6 py-8 text-center">
        <p className="text-xs tracking-wider text-[#9aa6a1]">
          ESTETIQI · BEAUTY INTELLIGENCE
        </p>
      </footer>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e1ebe5] bg-white p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#93a19a]">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold text-[#30463c]">{value}</p>

      <p className="mt-1 text-[11px] text-[#8a9791]">{detail}</p>
    </div>
  );
}